// DRV2605L selftest (ESP32-S3 Arduino variant of the AVR sketch): Wire on
// GPIO38/39; times are relative to setup() entry.
#include <Wire.h>

const int SDA_PIN = 38;
const int SCL_PIN = 39;
const byte ADDR = 0x5a;
// Reset values of 0x00..0x20 per the datasheet's register field tables.
const byte RESET_VALUES[0x21] = {
  0xE0, 0x40, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x05, 0x19, 0xFF, 0x19, 0xFF, 0x3E, 0x8C, 0x0C, 0x6F, 0x36, 0x93, 0xF5, 0xA0, 0x20, 0x80, 0x00,
};
unsigned long t0Ms = 0;

unsigned long appMillis() {
  return millis() - t0Ms;
}

void writeRegister(byte reg, byte value) {
  Wire.beginTransmission(ADDR);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

byte readRegister(byte reg) {
  Wire.beginTransmission(ADDR);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom(ADDR, (byte)1);
  return Wire.read();
}

int resetMismatches() {
  Wire.beginTransmission(ADDR);
  Wire.write(0x00);
  Wire.endTransmission(false);
  Wire.requestFrom(ADDR, (byte)0x21);
  int mismatches = 0;
  for (byte i = 0; i < 0x21; i++) {
    if (Wire.read() != RESET_VALUES[i]) mismatches++;
  }
  return mismatches;
}

void waitUntil(unsigned long ms) {
  while (appMillis() < ms) {}
}

// Fires GO and polls it every 1 ms; returns the ms until it reads 0.
unsigned long runUntilGoClears() {
  unsigned long start = appMillis();
  writeRegister(0x0C, 1);
  while (readRegister(0x0C) & 1) delay(1);
  return appMillis() - start;
}

void setup() {
  t0Ms = millis();
  Serial.begin(115200);
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);
  waitUntil(50);
  Serial.print("reset ");
  Serial.println(resetMismatches());

  waitUntil(200);
  writeRegister(0x01, 0x00);
  writeRegister(0x03, 0x01);
  writeRegister(0x1A, readRegister(0x1A) & 0x7F);
  writeRegister(0x1D, readRegister(0x1D) | 0x20);
  byte sequence[] = {10, 0x80 | 20, 47, 0};
  for (byte i = 0; i < sizeof sequence; i++) writeRegister(0x04 + i, sequence[i]);

  waitUntil(500);
  Serial.print("seq ");
  Serial.println(runUntilGoClears());

  waitUntil(1000);
  for (byte i = 0; i < 8; i++) writeRegister(0x04 + i, i + 1);
  Serial.print("eight ");
  Serial.println(runUntilGoClears());

  waitUntil(2000);
  writeRegister(0x04, 47);
  writeRegister(0x05, 0);
  writeRegister(0x0C, 1);
  waitUntil(2050);
  writeRegister(0x0C, 0);
  Serial.print("cancel ");
  Serial.println(readRegister(0x0C));

  waitUntil(2200);
  writeRegister(0x01, 0x05);
  writeRegister(0x02, 0x7F);
  waitUntil(2300);
  writeRegister(0x02, 0x81);
  waitUntil(2400);
  writeRegister(0x1D, readRegister(0x1D) | 0x08);
  writeRegister(0x02, 128);
  waitUntil(2500);
  writeRegister(0x02, 255);
  waitUntil(2600);
  writeRegister(0x01, 0x45);

  waitUntil(2700);
  writeRegister(0x01, 0x00);
  writeRegister(0x04, 1);
  writeRegister(0x05, 0);
  writeRegister(0x0C, 1);
  waitUntil(2750);
  writeRegister(0x01, 0x40);
  Serial.print("standby-go ");
  Serial.println(readRegister(0x0C));

  waitUntil(2900);
  writeRegister(0x01, 0x80);
  Serial.print("dev-reset ");
  Serial.println(resetMismatches());

  waitUntil(3100);
  writeRegister(0x01, 0x06);
  unsigned long ms = runUntilGoClears();
  Serial.print("diag ");
  Serial.print(ms);
  Serial.print(' ');
  Serial.println(readRegister(0x00));

  waitUntil(3300);
  writeRegister(0x01, 0x07);
  ms = runUntilGoClears();
  Serial.print("cal ");
  Serial.print(ms);
  Serial.print(' ');
  Serial.println(readRegister(0x00));
}

void loop() {}
