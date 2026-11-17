#include <Wire.h>
#include <math.h>

uint16_t failures = 0;
uint16_t sectionStart = 0;

void check(bool ok, const char *name) {
  if (!ok) { failures++; Serial.print("FAIL "); Serial.println(name); }
}
void finish(const char *name) {
  Serial.print(name); Serial.print(' '); Serial.println(failures - sectionStart);
  sectionStart = failures;
}
void waitUntil(unsigned long at) { while (millis() < at) {} }
uint16_t readWord(byte reg) {
  Wire.beginTransmission(0x36); Wire.write(reg);
  check(Wire.endTransmission(false) == 0, "pointer");
  check(Wire.requestFrom((byte)0x36, (byte)2) == 2, "read");
  uint16_t high = Wire.read(); return (high << 8) | Wire.read();
}
void writeWord(byte reg, uint16_t value) {
  Wire.beginTransmission(0x36); Wire.write(reg);
  Wire.write(value >> 8); Wire.write(value & 255);
  check(Wire.endTransmission() == 0, "write");
}
bool hibernating() { return (readWord(0x06) & 0x1000) != 0; }
bool voltage(float expected) { return fabs(readWord(0x02) * 0.000078125 - expected) < 0.002; }

void setup() {
  Serial.begin(9600); Wire.begin();
  waitUntil(1000);
  check(!hibernating(), "active-at-start");
  check(readWord(0x04) == 50 * 256 && voltage(3.8), "entry-values");
  writeWord(0x0a, 0xffff);
  check(hibernating(), "forced-entry");
  waitUntil(45000);
  check(readWord(0x04) == 50 * 256 && voltage(3.8), "forced-45-second-hold");
  finish("forced-hold");
  waitUntil(47000);
  check(hibernating(), "forced-ignores-activity");
  check(readWord(0x04) == 70 * 256 && voltage(4.0), "forced-45-second-update");
  writeWord(0x0a, 0);
  check(!hibernating(), "forced-wake");
  finish("forced-update");
  Serial.print("failures "); Serial.println(failures);
}
void loop() {}
