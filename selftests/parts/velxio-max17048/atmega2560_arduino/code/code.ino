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

byte writeBytes(byte reg, byte high, byte low, bool both = true) {
  Wire.beginTransmission(0x36);
  Wire.write(reg); Wire.write(high);
  if (both) Wire.write(low);
  return Wire.endTransmission();
}

void writeWord(byte reg, uint16_t value) {
  check(writeBytes(reg, value >> 8, value & 255) == 0, "write");
}

uint16_t readWord(byte reg) {
  Wire.beginTransmission(0x36); Wire.write(reg);
  check(Wire.endTransmission(false) == 0, "pointer");
  check(Wire.requestFrom((byte)0x36, (byte)2) == 2, "read");
  uint16_t high = Wire.read();
  return (high << 8) | Wire.read();
}

void waitUntil(unsigned long at) { while (millis() < at) {} }

void setup() {
  Serial.begin(9600); Wire.begin();
  pinMode(2, INPUT); pinMode(3, OUTPUT); digitalWrite(3, LOW);
  check(readWord(0x08) == 0x12, "version");
  check(readWord(0x0a) == 0x8030, "hib-default");
  check(readWord(0x0c) == 0x971c, "config-default");
  check(readWord(0x18) == 0x9648, "vreset-default-id");
  check(readWord(0x1a) == 0x0100, "status-default");
  check(readWord(0x04) == 0, "startup-not-ready");
  delay(300);
  check(abs((long)readWord(0x02) - 48640) < 20, "voltage-encoding");
  check(readWord(0x04) == 12800, "soc-encoding");
  finish("defaults");

  check(writeBytes(0x0a, 0xff, 0, false) == 0, "byte-ack");
  check(readWord(0x0a) == 0x8030, "byte-ignored");
  writeWord(0x0c, 0x8311);
  check(readWord(0x0c) == 0x8311, "rcomp-athd");
  writeWord(0x18, 0x8842);
  check(readWord(0x18) == 0x8848, "id-readonly");
  writeWord(0x02, 0);
  check(readWord(0x02) != 0, "vcell-readonly");
  writeWord(0x0a, 0x0000);
  finish("word-config");

  writeWord(0x06, 0x6000);
  check(readWord(0x06) == 0x2000, "quick-selfclear");
  check(readWord(0x04) == 0, "quick-reacquire");
  delay(300);
  check(readWord(0x04) == 12800, "quick-result");
  digitalWrite(3, HIGH); delay(2);
  check(readWord(0x04) == 0, "hardware-quick");
  delay(300);
  check(readWord(0x04) == 12800, "hardware-result");
  digitalWrite(3, LOW);
  finish("quickstart");

  waitUntil(1500);
  writeWord(0x14, (195 << 8) | 200);
  delay(300);
  check((readWord(0x1a) & 0x0400) != 0, "low-voltage-status");
  check(digitalRead(2) == LOW, "int-low");
  writeWord(0x14, 0x00ff);
  writeWord(0x1a, 0);
  check(digitalRead(2) == LOW, "int-latched");
  writeWord(0x0c, 0x8311);
  delay(2);
  check(digitalRead(2) == HIGH, "int-clear");
  writeWord(0x14, 180);
  delay(300);
  check((readWord(0x1a) & 0x0200) != 0, "high-voltage-status");
  writeWord(0x14, 0x00ff); writeWord(0x1a, 0); writeWord(0x0c, 0x8311);
  finish("voltage-alerts");

  waitUntil(3000);
  writeWord(0x0c, 0x8351);
  waitUntil(4500);
  check((readWord(0x1a) & 0x3000) == 0x3000, "soc-alerts");
  check(digitalRead(2) == LOW, "soc-int");
  writeWord(0x1a, 0); writeWord(0x0c, 0x8351);
  delay(1100);
  check((readWord(0x1a) & 0x3000) == 0, "no-repeat-constant-soc");
  finish("soc-alerts");

  waitUntil(6000);
  writeWord(0x06, 0x2000); writeWord(0x0c, 0x8391);
  const uint16_t asleepSoc = readWord(0x04);
  waitUntil(7600);
  check(readWord(0x04) == asleepSoc, "sleep-hold");
  writeWord(0x0c, 0x8311);
  delay(1100);
  check(readWord(0x04) == 60 * 256, "sleep-wake");
  finish("software-sleep");

  waitUntil(9000);
  writeWord(0x0a, 0xffff);
  check((readWord(0x06) & 0x1000) != 0, "forced-hibernate");
  const uint16_t held = readWord(0x04);
  waitUntil(11500);
  check(readWord(0x04) == held, "hibernate-hold");
  writeWord(0x0a, 0); delay(1100);
  check(readWord(0x04) == 70 * 256, "hibernate-wake");
  finish("hibernate");

  waitUntil(13000);
  check((int16_t)readWord(0x16) == -48, "negative-crate");
  waitUntil(15000);
  check((int16_t)readWord(0x16) == 48, "positive-crate");
  finish("crate");

  waitUntil(16000);
  writeWord(0x18, 0xa048); writeWord(0x1a, 0x4000);
  waitUntil(17500);
  check((readWord(0x1a) & 0x0800) != 0, "vreset-status");
  check(digitalRead(2) == LOW, "vreset-int");
  finish("voltage-reset");

  waitUntil(18000);
  writeWord(0x06, 0x2000);
  const uint16_t busHeld = readWord(0x04);
  Wire.end();
  pinMode(20, OUTPUT); pinMode(21, OUTPUT);
  digitalWrite(20, LOW); digitalWrite(21, LOW);
  delay(2800);
  digitalWrite(20, HIGH); digitalWrite(21, HIGH);
  Wire.begin();
  check(readWord(0x04) == busHeld, "bus-sleep-held");
  delay(1100);
  check(readWord(0x08) == 0x12, "bus-sleep-wake");
  check(readWord(0x04) == 90 * 256, "bus-sleep-new-soc");
  finish("bus-sleep");

  waitUntil(22500);
  Wire.beginTransmission(0x36);
  check(Wire.endTransmission() == 2, "disconnected-nack");
  waitUntil(23500);
  check(readWord(0x08) == 0x12, "reconnected-version");
  check(readWord(0x04) == 25 * 256, "reconnected-soc");
  finish("battery-power");

  check(writeBytes(0xfe, 0x54, 0) == 3, "reset-nack-last-byte");
  check(readWord(0x0c) == 0x971c, "reset-config");
  check(readWord(0x0a) == 0x8030, "reset-hib");
  delay(300);
  check(readWord(0x04) == 25 * 256, "reset-soc");
  finish("reset");
  Serial.print("failures "); Serial.println(failures);
}

void loop() {}
