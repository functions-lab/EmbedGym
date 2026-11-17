// MLX90614 SMBus selftest (nrf52840_arduino variant of the AVR sketch):
// Wire on i2c0. This core ends endTransmission(false) with a STOP, not a repeated START.
#include <Wire.h>

const byte ADDR = 0x5a;
uint16_t failures = 0;
uint16_t sectionStart = 0;

void check(bool ok, const char *name) {
  if (!ok) {
    failures++;
    Serial.print("FAIL ");
    Serial.println(name);
  }
}

void finishSection(const char *name) {
  Serial.print(name);
  Serial.print(' ');
  Serial.println(failures - sectionStart);
  sectionStart = failures;
}

byte crc8(const byte *data, byte length) {
  byte crc = 0;
  for (byte i = 0; i < length; i++) {
    crc ^= data[i];
    for (byte bit = 0; bit < 8; bit++) crc = (crc & 0x80) ? (crc << 1) ^ 0x07 : crc << 1;
  }
  return crc;
}

uint16_t readWord(byte command) {
  Wire.beginTransmission(ADDR);
  Wire.write(command);
  check(Wire.endTransmission(false) == 0, "command-ack");
  check(Wire.requestFrom(ADDR, (byte)3) == 3, "read-3-bytes");
  byte frame[5] = {ADDR << 1, command, (ADDR << 1) | 1, (byte)Wire.read(), (byte)Wire.read()};
  check(Wire.read() == crc8(frame, 5), "read-pec");
  return frame[3] | (frame[4] << 8);
}

byte writeWord(byte command, uint16_t value, bool goodPec) {
  byte frame[4] = {ADDR << 1, command, (byte)(value & 0xff), (byte)(value >> 8)};
  byte pec = crc8(frame, 4);
  Wire.beginTransmission(ADDR);
  Wire.write(command);
  Wire.write(frame[2]);
  Wire.write(frame[3]);
  Wire.write(goodPec ? pec : (byte)(pec ^ 0xff));
  return Wire.endTransmission();
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  Wire.setClock(100000);
  delay(300);

  Wire.beginTransmission(ADDR);
  check(Wire.endTransmission() == 0, "address-probe");
  finishSection("probe");

  check(readWord(0x07) == 15095, "tobj1-28.75");
  check(readWord(0x06) == 14732, "ta-21.49");
  finishSection("ram");

  check(readWord(0x24) == 0xffff, "emissivity-factory");
  check((readWord(0x2e) & 0xff) == ADDR, "smbus-address-cell");
  check((readWord(0x22) & 0x0002) == 0, "pwm-disabled");
  check((readWord(0x25) & 0x0040) == 0, "single-ir-sensor");
  check(readWord(0xf0) == 0x0010, "flags-idle");
  finishSection("eeprom");

  check(writeWord(0x24, 0x0000, true) == 0, "erase-ack");
  check(readWord(0xf0) == 0x0090, "eebusy-after-erase");
  delay(10);
  check(readWord(0xf0) == 0x0010, "eebusy-clears");
  check(readWord(0x24) == 0x0000, "erased");
  check(writeWord(0x24, 0xf332, true) == 0, "write-ack");
  delay(10);
  check(readWord(0x24) == 0xf332, "written");
  check(readWord(0x07) == 15095, "emissivity-waits-for-power-up");
  writeWord(0x24, 0x0000, true);
  delay(10);
  writeWord(0x24, 0xffff, true);
  delay(10);
  check(readWord(0x24) == 0xffff, "restored");
  finishSection("eeprom-write");

  check(writeWord(0x24, 0x0000, false) != 0, "bad-pec-nacked");
  delay(10);
  check(readWord(0x24) == 0xffff, "bad-pec-discarded");
  finishSection("bad-pec");

  Serial.print("failures ");
  Serial.println(failures);
}

void loop() {
  uint16_t object = readWord(0x07);
  uint16_t ambient = readWord(0x06);
  Serial.print("raw ");
  Serial.print(object);
  Serial.print(' ');
  Serial.println(ambient);
  delay(500);
}
