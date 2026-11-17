// HMC5883L register-level selftest (nrf52840_arduino variant of the AVR
// sketch): Wire on i2c0, DRDY on P1_04.
#include <Wire.h>
#include <math.h>

const int DRDY_PIN = P1_04;

volatile uint16_t pulses = 0;
volatile unsigned long pulseAt = 0;
volatile unsigned long pulseWidth = 0;
uint16_t failures = 0;
uint16_t sectionStart = 0;
const int gains[] = {1370, 1090, 820, 660, 440, 390, 330, 230};
const unsigned long periods[] = {1333333UL, 666667UL, 333333UL, 133333UL, 66667UL, 33333UL, 13333UL};

struct Axes { int16_t x; int16_t y; int16_t z; };

void readyEdge() {
  if (digitalRead(DRDY_PIN) == LOW) {
    pulseAt = micros();
    pulses++;
  } else if (digitalRead(DRDY_PIN) == HIGH) {
    pulseWidth = micros() - pulseAt;
  }
}

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

void busFailure() {
  Serial.println("FAIL bus");
  while (true) delay(1000);
}

void point(byte reg) {
  Wire.beginTransmission(0x1e);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) busFailure();
}

void writeReg(byte reg, byte value) {
  Wire.beginTransmission(0x1e);
  Wire.write(reg);
  Wire.write(value);
  if (Wire.endTransmission() != 0) busFailure();
}

void readBytes(byte reg, byte *data, byte length) {
  point(reg);
  if (Wire.requestFrom((byte)0x1e, length) != length) busFailure();
  for (byte i = 0; i < length; i++) data[i] = Wire.read();
}

byte readReg(byte reg) {
  byte value;
  readBytes(reg, &value, 1);
  return value;
}

Axes decode(const byte *data) {
  return {(int16_t)(((uint16_t)data[0] << 8) | data[1]),
          (int16_t)(((uint16_t)data[4] << 8) | data[5]),
          (int16_t)(((uint16_t)data[2] << 8) | data[3])};
}

Axes readAxes() {
  byte data[6];
  readBytes(3, data, 6);
  return decode(data);
}

void expectAxes(Axes value, int x, int y, int z, const char *name) {
  check(value.x == x && value.y == y && value.z == z, name);
}

void expectField(Axes value, int gain, float x = .3, float y = -.2, float z = .1) {
  expectAxes(value, lround(x * gain), lround(y * gain), lround(z * gain), "axis-order-sign-gain");
}

unsigned long waitReady(unsigned long timeoutUs) {
  unsigned long started = micros();
  while ((readReg(9) & 1) == 0) {
    if (micros() - started > timeoutUs) {
      check(false, "ready-timeout");
      return micros();
    }
  }
  return micros();
}

bool nearTime(unsigned long elapsed, unsigned long wanted, unsigned long tolerance) {
  return elapsed + tolerance >= wanted && elapsed <= wanted + tolerance;
}

Axes single() {
  writeReg(2, 1);
  unsigned long started = micros();
  waitReady(15000);
  check(nearTime(micros() - started, 6000, 2500), "single-6ms");
  return readAxes();
}

void idle() {
  writeReg(2, 2);
  readAxes();
}

void until(unsigned long timeMs) {
  while (millis() < timeMs) delay(1);
}

void setup() {
  Serial.begin(115200);
  pinMode(DRDY_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(DRDY_PIN), readyEdge, CHANGE);
  Wire.begin();
  Wire.setClock(400000);

  check(readReg(0) == 0x10 && readReg(1) == 0x20, "powerup-config");
  check(readReg(2) == 1, "powerup-single-mode");
  check((readReg(9) & 2) != 0, "mode-read-locks");
  writeReg(0, 0x30);
  check((readReg(9) & 2) == 0, "CRA-unlocks-startup");
  until(50);
  check((readReg(9) & 1) == 0 && pulses == 0, "powerup-not-early");
  unsigned long startupReady = waitReady(15000);
  // micros() runs 2.1 ms behind the reset axis the part powers on at.
  check(startupReady >= 53000 && startupReady <= 57000, "powerup-56ms");
  expectField(readAxes(), 1090);
  check((readReg(9) & 3) == 0, "read-clears-ready-lock");
  check(readReg(2) == 2, "single-auto-idle");
  readAxes();
  delay(1);
  check(pulses == 1 && digitalRead(DRDY_PIN) == HIGH, "startup-DRDY");
  check(pulseWidth >= 230 && pulseWidth <= 280, "DRDY-250us");
  finishSection("startup");

  byte ids[4];
  readBytes(10, ids, 4);
  check(ids[0] == 'H' && ids[1] == '4' && ids[2] == '3' && ids[3] == 0x30, "IDs-pointer-wrap");
  writeReg(0, 0xb0);
  check(readReg(0) == 0x30, "CRA-reserved-bit");
  writeReg(1, 0x3f);
  check(readReg(1) == 0x20, "CRB-reserved-bits");
  writeReg(2, 0xfe);
  check(readReg(2) == 0x82, "mode-HS-reserved-bits");
  readAxes();
  writeReg(0x20, 0xaa);
  check(readReg(0x20) == 0, "reserved-register");
  writeReg(10, 0xff);
  check(readReg(10) == 'H', "IDs-read-only");
  finishSection("registers");

  for (byte average = 0; average < 4; average++) {
    byte config = (average << 5) | 0x10;
    writeReg(0, config);
    check(readReg(0) == config, "averaging-readback");
    expectField(single(), 1090);
  }
  finishSection("averaging");

  byte previousGain = 1;
  for (byte gain = 0; gain < 8; gain++) {
    writeReg(1, gain << 5);
    check(readReg(1) == (gain << 5), "gain-readback");
    expectField(single(), gains[previousGain]);
    expectField(single(), gains[gain]);
    previousGain = gain;
  }
  finishSection("gains");

  writeReg(1, 0x20);
  single();
  for (byte rate = 0; rate < 7; rate++) {
    idle();
    writeReg(0, rate << 2);
    check(readReg(0) == (rate << 2), "rate-readback");
    uint16_t before = pulses;
    writeReg(2, 0);
    unsigned long started = micros();
    waitReady(2 * periods[rate] + 20000);
    check(nearTime(micros() - started, 2 * periods[rate], 3000), "continuous-first-2periods");
    unsigned long firstPulse = pulseAt;
    check(pulses == before + 1, "continuous-first-DRDY");
    expectField(readAxes(), 1090);
    check((readReg(9) & 3) == 0, "continuous-read-clears-ready");
    waitReady(periods[rate] + 10000);
    check(nearTime(pulseAt - firstPulse, periods[rate], 1000), "continuous-period");
    check(pulses == before + 2, "continuous-second-DRDY");
    expectField(readAxes(), 1090);
    Serial.print("rate-");
    Serial.print(rate);
    Serial.print(' ');
    Serial.println(failures - sectionStart);
    sectionStart = failures;
  }

  idle();
  writeReg(0, 0x18);
  writeReg(1, 0x20);
  writeReg(2, 0);
  waitReady(40000);
  byte data[6];
  readBytes(3, data, 1);
  check((readReg(9) & 3) == 2, "partial-read-lock-ready");
  writeReg(1, 0);
  check((readReg(9) & 2) != 0, "CRB-does-not-unlock");
  uint16_t beforeLocked = pulses;
  delay(45);
  check(pulses == beforeLocked && (readReg(9) & 3) == 2, "locked-update-suppressed");
  readBytes(4, data + 1, 5);
  expectField(decode(data), 1090);
  check((readReg(9) & 3) == 0, "all6-unlock");
  waitReady(25000);
  expectField(readAxes(), 1370);
  check(readReg(2) == 0 && (readReg(9) & 2) != 0, "mode-read-lock");
  writeReg(0, 0x38);
  check((readReg(9) & 2) == 0, "CRA-change-unlocks");
  waitReady(40000);
  readBytes(3, data, 1);
  writeReg(2, 2);
  check((readReg(9) & 2) == 0, "mode-change-unlocks");
  readAxes();
  finishSection("locking");

  writeReg(1, 0x20);
  single();
  writeReg(0, 0x10);
  Axes normal = single();
  expectField(normal, 1090);
  writeReg(0, 0x11);
  expectAxes(single(), 1264, 1264, 1177, "positive-bias-offset-only");
  writeReg(0, 0x12);
  expectAxes(single(), -1264, -1264, -1177, "negative-bias-offset-only");
  writeReg(0, 0x10);
  expectField(single(), 1090);
  byte repeated[12];
  readBytes(3, repeated, 12);
  for (byte i = 0; i < 6; i++) check(repeated[i] == repeated[i + 6], "data-pointer-wrap");
  check((readReg(9) & 2) == 0, "two-bursts-unlock");
  finishSection("bias-wrap");

  for (byte mode = 2; mode <= 3; mode++) {
    writeReg(2, mode);
    readAxes();
    uint16_t before = pulses;
    delay(40);
    check(pulses == before && (readReg(9) & 1) == 0, "idle-no-measurements");
    check(readReg(2) == mode, "idle-readback");
    expectField(readAxes(), 1090);
  }
  writeReg(2, 0x81);
  waitReady(15000);
  expectField(readAxes(), 1090);
  check(readReg(2) == 0x82, "HS-single-auto-idle");
  readAxes();
  finishSection("idle-HS");

  until(20020);
  expectField(single(), 1090, .6, -.4, .2);
  writeReg(0, 0x11);
  expectAxes(single(), 1264, 1264, 1177, "changed-ambient-positive-bias");
  writeReg(0, 0x12);
  expectAxes(single(), -1264, -1264, -1177, "changed-ambient-negative-bias");
  writeReg(0, 0x10);
  expectField(single(), 1090, .6, -.4, .2);
  finishSection("controls-bias");

  until(23020);
  for (byte bias = 0; bias < 3; bias++) {
    writeReg(0, 0x10 | bias);
    expectAxes(single(), -4096, -4096, -4096, "overflow-sentinel");
  }
  finishSection("overflow");

  until(25020);
  writeReg(0, 0x10);
  expectField(single(), 1090);
  finishSection("recovery");
  Serial.print("failures ");
  Serial.println(failures);
}

void loop() {}
