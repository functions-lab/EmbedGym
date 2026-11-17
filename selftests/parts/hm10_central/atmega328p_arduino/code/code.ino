// SoftwareSerial cannot receive while it transmits, so console bytes wait
// until the module has been quiet for 2 ms.
#include <SoftwareSerial.h>

SoftwareSerial hm10(8, 7);
unsigned long lastModuleByte = 0;

void setup() {
  Serial.begin(9600);
  hm10.begin(9600);
}

void loop() {
  while (hm10.available()) {
    Serial.write(hm10.read());
    lastModuleByte = micros();
  }
  if (Serial.available() && micros() - lastModuleByte >= 2000) hm10.write(Serial.read());
}
