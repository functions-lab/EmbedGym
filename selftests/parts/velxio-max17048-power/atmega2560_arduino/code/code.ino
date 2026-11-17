#include <Wire.h>

uint16_t failures = 0;
void check(bool ok, const char *name) {
  if (!ok) { failures++; Serial.print("FAIL "); Serial.println(name); }
}
byte scan() { Wire.beginTransmission(0x36); return Wire.endTransmission(); }
void setup() {
  Serial.begin(9600); Wire.begin(); pinMode(2, INPUT);
  check(scan() == 2, "no-battery-nack");
  check(digitalRead(2) == HIGH, "unpowered-int-released");
  Serial.print("unpowered "); Serial.println(failures);
  while (millis() < 1500) {}
  check(scan() == 0, "battery-insertion-ack");
  check(digitalRead(2) == HIGH, "powered-int-released");
  Wire.beginTransmission(0x36); Wire.write(0x04);
  check(Wire.endTransmission(false) == 0, "soc-pointer");
  check(Wire.requestFrom((byte)0x36, (byte)2) == 2, "soc-read");
  uint16_t high = Wire.read();
  check(((high << 8) | Wire.read()) == 50 * 256, "soc-ready");
  Serial.print("failures "); Serial.println(failures);
}
void loop() {}
