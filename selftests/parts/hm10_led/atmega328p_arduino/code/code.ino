#include <SoftwareSerial.h>

SoftwareSerial hm10(8, 7);

void setup() {
  Serial.begin(9600);
  hm10.begin(9600);
  pinMode(4, OUTPUT);
  digitalWrite(4, LOW);
}

void loop() {
  while (hm10.available()) {
    const char command = hm10.read();
    if (command == '1') {
      digitalWrite(4, HIGH);
      hm10.println("LED=ON");
      Serial.println("LED=ON");
    } else if (command == '0') {
      digitalWrite(4, LOW);
      hm10.println("LED=OFF");
      Serial.println("LED=OFF");
    }
  }
}
