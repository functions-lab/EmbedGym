#include <Wire.h>

uint16_t failures = 0;
uint16_t sectionStart = 0;

void check(bool ok, const char *name) {
  if (!ok) { failures++; Serial.print("FAIL "); Serial.println(name); }
}
void finish(const char *name) {
  Serial.print(name); Serial.print(' '); Serial.println(failures - sectionStart); sectionStart = failures;
}
void until(unsigned long at) { while (millis() < at) {} }
void writeReg(byte reg, byte value) {
  Wire.beginTransmission(0x69); Wire.write(reg); Wire.write(value);
  check(Wire.endTransmission() == 0, "I2C-write");
}
void readBytes(byte reg, byte *data, byte size) {
  Wire.beginTransmission(0x69); Wire.write(reg); check(Wire.endTransmission(false) == 0, "I2C-pointer");
  check(Wire.requestFrom((byte)0x69, size) == size, "I2C-read");
  for (byte i = 0; i < size; i++) data[i] = Wire.read();
}
byte readReg(byte reg) { byte data; readBytes(reg, &data, 1); return data; }
int pixel(byte index) {
  byte data[2]; readBytes(0x80 + 2 * index, data, 2);
  int value = data[0] | ((data[1] & 15) << 8); return value & 0x800 ? value - 4096 : value;
}
float thermistor() {
  byte data[2]; readBytes(0x0e, data, 2); int value = data[0] | (data[1] << 8);
  return ((value & 0x800) ? -(value & 0x7ff) : value) / 16.0;
}
void levels(int high, int low, int hysteresis) {
  writeReg(8, high & 255); writeReg(9, (high >> 8) & 15);
  writeReg(10, low & 255); writeReg(11, (low >> 8) & 15);
  writeReg(12, hysteresis & 255); writeReg(13, (hysteresis >> 8) & 15);
}
void clear() { writeReg(5, 6); }

void setup() {
  Serial.begin(115200); Wire.begin(); Wire.setClock(400000); pinMode(2, INPUT);
  check(readReg(0) == 0 && readReg(2) == 0 && readReg(3) == 0, "defaults");
  until(220);
  for (byte i = 0; i < 64; i++) check(pixel(i) == i - 32, "all64-signed-pixels");
  check(thermistor() == -12.0625, "signed-independent-thermistor");
  finish("encoding");

  writeReg(2, 0xfe); writeReg(3, 0xfe); writeReg(9, 0xf0);
  check(readReg(2) == 0 && readReg(3) == 2 && readReg(9) == 0, "unused-bit-masks");
  until(1750); check(pixel(0) == 100 && pixel(63) == 100, "physical-frame-inputs");
  until(1900); writeReg(2, 1); writeReg(7, 0x20);
  until(2800); check(pixel(0) == 100, "one-fps-not-early");
  until(3050); check(pixel(0) == 120 && thermistor() == 25, "two-frame-average");
  until(4050); check(pixel(0) == 140, "average-settles");
  writeReg(0x1f, 0x50); writeReg(0x1f, 0x45); writeReg(0x1f, 0x57); writeReg(7, 0); writeReg(0x1f, 0);
  check(readReg(7) == 0, "vendor-average-sequence");
  finish("frame-average");

  until(4300); writeReg(0, 0x10); writeReg(2, 0); writeReg(1, 0x3f);
  until(4700); writeReg(0, 0); delay(51); writeReg(1, 0x3f); delay(3); writeReg(1, 0x30);
  check(readReg(2) == 1 && readReg(3) == 2 && readReg(7) == 0, "wake-config-retained");
  check(pixel(0) == 0, "initial-reset-pixel-clear");
  until(5800); check(pixel(0) == 180 && thermistor() == 5.5, "wake-fresh-inputs");
  writeReg(1, 0x30); check(pixel(0) == 180, "flag-reset-data-retained");
  finish("sleep-reset");

  until(6005); writeReg(2, 0); levels(120, 40, 100); writeReg(3, 3);
  until(6200); clear();
  until(6650); check(readReg(0x17) == 128 && digitalRead(2) == LOW, "upper-pixel63-INT");
  clear(); until(6850); check((readReg(4) & 2) && digitalRead(2) == LOW, "clear-reasserts");
  until(7150); clear(); until(7250); check(readReg(0x17) == 128, "upper-hysteresis-hold");
  until(7650); clear(); until(7750); check(readReg(4) == 0 && digitalRead(2) == HIGH, "upper-inclusive-recovery");
  until(8150); check(readReg(0x10) == 2 && digitalRead(2) == LOW, "lower-pixel1-INT");
  until(8650); clear(); until(8750); check(readReg(0x10) == 2, "lower-hysteresis-hold");
  until(9150); clear(); until(9250); check(readReg(4) == 0, "lower-inclusive-recovery");
  writeReg(3, 2);
  until(9650); check(readReg(0x10) == 4 && digitalRead(2) == HIGH, "INT-output-mask-retains-table");
  writeReg(3, 3); delay(1); check(digitalRead(2) == LOW, "INT-enable-latched");
  until(10150); clear(); until(10250); check(readReg(4) == 0, "exact-upper-limit");
  finish("interrupts");

  levels(16, -16, 0); writeReg(3, 1); clear();
  until(10650); check(readReg(0x10) == 8, "difference-upper");
  until(11050); check(readReg(0x17) == 16, "difference-lower");
  until(11150); clear(); until(11250); check(readReg(4) == 0, "difference-clears");
  until(11650); clear(); until(11750); check(readReg(4) == 0, "difference-stable-recovers");
  finish("difference");

  until(12150); check((readReg(4) & 4) != 0, "ADC-fault");
  writeReg(5, 4); check((readReg(4) & 4) == 0, "ADC-selective-clear");
  until(12250); check((readReg(4) & 4) != 0, "ADC-fault-reassert");
  until(13150); writeReg(1, 0x30); until(13250); check((readReg(4) & 4) == 0, "ADC-fault-recovery");
  finish("ADC-fault");

  until(13500); levels(120, 40, 100); writeReg(3, 3); writeReg(7, 0x20); writeReg(2, 1); writeReg(1, 0x3f);
  check(readReg(3) == 3 && readReg(7) == 0x20 && readReg(2) == 1 && readReg(8) == 120, "initial-reset-retains-config");
  delay(3); writeReg(1, 0x30); until(15600); check(pixel(0) == 100, "initial-reset-frames");
  writeReg(7, 0); writeReg(2, 0); writeReg(3, 2);
  until(16500); writeReg(0, 0x20); clear();
  until(76000); check(pixel(62) == 100, "standby60-not-early");
  until(76750); check(pixel(62) == 160 && (readReg(0x17) & 64), "standby60-frame-and-table");
  writeReg(0, 0x21); clear();
  until(86500); check(pixel(62) == 160, "standby10-not-early");
  until(87000); check(pixel(62) == 180 && (readReg(0x17) & 64), "standby10-frame");
  writeReg(0, 0); until(87250); check(pixel(62) == 180, "standby-normal-return");
  finish("standby-reset");
  Serial.print("failures "); Serial.println(failures);
}
void loop() {}
