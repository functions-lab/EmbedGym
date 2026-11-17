#include <SoftwareSerial.h>

SoftwareSerial hm10(8, 7);
bool released = false;

void setup() {
  Serial.begin(9600);
  pinMode(2, OUTPUT);
  digitalWrite(2, HIGH);
  pinMode(3, INPUT);
  hm10.begin(9600);
  Serial.print("RTS=");
  Serial.println(digitalRead(3));
  hm10.print("AT");
}

void loop() {
  if (!released && millis() >= 300) {
    digitalWrite(2, LOW);
    released = true;
  }
  while (hm10.available()) Serial.write(hm10.read());
}
