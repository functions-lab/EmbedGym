// SGP40 unit test sketch (ESP32-S3 Arduino variant of code/code.ino).

#include <Wire.h>
#include "Adafruit_SGP40.h"

const int SDA_PIN = 38;
const int SCL_PIN = 39;

Adafruit_SGP40 sgp;

void setup() {
  Serial.begin(115200);
  Wire.begin(SDA_PIN, SCL_PIN);
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
