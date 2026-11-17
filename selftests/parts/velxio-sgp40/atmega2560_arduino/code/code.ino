#include <Wire.h>
#include "Adafruit_SGP40.h"

Adafruit_SGP40 sgp;

void setup() {
  Serial.begin(9600);
  if (!sgp.begin()) {
    Serial.println("init failed");
    while (1) delay(10);
  }

  Serial.print("SERIAL ");
  Serial.print(sgp.serialnumber[0], HEX);
  Serial.print(" ");
  Serial.print(sgp.serialnumber[1], HEX);
  Serial.print(" ");
  Serial.println(sgp.serialnumber[2], HEX);

  Serial.print("SELFTEST ");
  Serial.println(sgp.selfTest() ? "PASS" : "FAIL");

  Serial.print("HEATEROFF ");
  Serial.println(sgp.heaterOff() ? "OK" : "FAIL");

  Serial.print("RESET ");
  Serial.println(sgp.softReset() ? "OK" : "FAIL");
}

void loop() {
  Serial.print("RAW ");
  Serial.println(sgp.measureRaw());

  Serial.print("COMP ");
  Serial.println(sgp.measureRaw(30.0, 80.0));

  delay(400);
}
