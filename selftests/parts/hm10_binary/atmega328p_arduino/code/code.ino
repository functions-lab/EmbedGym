// SoftwareSerial cannot receive while it transmits, so echoes and console
// bytes go out once the module has been quiet for 2 ms.
#include <SoftwareSerial.h>

SoftwareSerial hm10(8, 7);
byte echo[64];
int echoLength = 0;
unsigned long lastModuleByte = 0;

void setup() {
  Serial.begin(9600);
  hm10.begin(9600);
}

void loop() {
  while (hm10.available()) {
    const byte value = hm10.read();
    Serial.write(value);
    if (echoLength < (int)sizeof(echo)) echo[echoLength++] = value;
    lastModuleByte = micros();
  }
  if (micros() - lastModuleByte < 2000) return;
  for (int i = 0; i < echoLength; i++) hm10.write(echo[i]);
  echoLength = 0;
  if (Serial.available()) hm10.write(Serial.read());
}
