void setup() {
  Serial.begin(9600);
  Serial1.begin(9600);
  pinMode(4, OUTPUT);
  digitalWrite(4, LOW);
}

void loop() {
  while (Serial1.available()) {
    const char command = Serial1.read();
    if (command == '1') {
      digitalWrite(4, HIGH);
      Serial1.println("LED=ON");
      Serial.println("LED=ON");
    } else if (command == '0') {
      digitalWrite(4, LOW);
      Serial1.println("LED=OFF");
      Serial.println("LED=OFF");
    }
  }
}
