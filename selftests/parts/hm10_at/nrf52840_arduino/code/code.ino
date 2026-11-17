// HM-10 bridge: Serial1 is uart1 (TX P1_02, RX P1_01).
void setup() {
  Serial.begin(115200);
  Serial1.begin(9600);
}

void loop() {
  while (Serial.available()) Serial1.write(Serial.read());
  while (Serial1.available()) Serial.write(Serial1.read());
}
