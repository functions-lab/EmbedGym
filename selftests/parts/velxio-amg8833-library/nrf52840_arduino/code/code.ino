// AMG8833 library selftest (nrf52840_arduino variant of the AVR sketch):
// Adafruit_AMG88xx on Wire (i2c0), INT on P1_04.
#include <Adafruit_AMG88xx.h>
#include <math.h>

const int INT_PIN = P1_04;

Adafruit_AMG88xx camera;
uint16_t failures = 0;
uint16_t sectionStart = 0;
float pixels[64];
byte raw[128];

void check(bool ok, const char *name) {
  if (!ok) { failures++; Serial.print("FAIL "); Serial.println(name); }
}
void finish(const char *name) {
  Serial.print(name); Serial.print(' '); Serial.println(failures - sectionStart); sectionStart = failures;
}
void until(unsigned long at) { while (millis() < at) delay(1); }
byte readReg(byte reg) {
  Wire.beginTransmission(AMG88xx_ADDRESS); Wire.write(reg); check(Wire.endTransmission(false) == 0, "I2C-pointer");
  check(Wire.requestFrom((byte)AMG88xx_ADDRESS, (byte)1) == 1, "I2C-read"); return Wire.read();
}

void setup() {
  Serial.begin(115200); pinMode(INT_PIN, INPUT);
  check(camera.begin(), "stock-begin"); delay(210);
  check(camera.readThermistor() == -12.0625, "stock-signed-thermistor");
  camera.readPixels(pixels); camera.readPixelsRaw(raw);
  for (byte i = 0; i < 64; i++) check(pixels[i] == 25 && raw[2 * i] == 100 && raw[2 * i + 1] == 0, "stock-full-array");
  finish("stock-init");

  until(1250); camera.readPixels(pixels); camera.readPixelsRaw(raw);
  for (byte i = 0; i < 64; i++) {
    int value = raw[2 * i] | (raw[2 * i + 1] << 8); if (value & 0x800) value -= 4096;
    check(pixels[i] == (i - 32) * .25 && value == i - 32, "stock64-independent-pixels");
  }
  check(camera.readThermistor() == 30.0625, "stock-fresh-thermistor");
  camera.readPixels(pixels, 7); camera.readPixelsRaw(raw, 7);
  check(pixels[6] == -6.5 && raw[12] == 230, "stock-partial-array");
  camera.setMovingAverageMode(true); check(readReg(7) == 32, "stock-average-on");
  until(1800); camera.readPixels(pixels); check(pixels[0] == 25 && pixels[63] == 25, "stock-average-settled");
  camera.setMovingAverageMode(false); check(readReg(7) == 0, "stock-average-off");
  finish("stock-data-average");

  camera.setInterruptLevels(30, 10); check(readReg(12) == 114, "stock-default-hysteresis");
  camera.setInterruptLevels(30, 10, 25); camera.setInterruptMode(AMG88xx_ABSOLUTE_VALUE); camera.clearInterrupt(); camera.enableInterrupt();
  until(2250); byte bitmap[8]; camera.getInterrupt(bitmap);
  check(bitmap[0] == 1 && bitmap[7] == 0 && digitalRead(INT_PIN) == LOW, "stock-upper-table-and-INT");
  camera.disableInterrupt(); delay(1); check(digitalRead(INT_PIN) == HIGH && (readReg(4) & 2), "stock-disable-mask");
  camera.enableInterrupt(); delay(1); check(digitalRead(INT_PIN) == LOW, "stock-reenable-latch");
  camera.clearInterrupt(); delay(1); check(readReg(4) == 0 && digitalRead(INT_PIN) == HIGH, "stock-clear-interrupt");
  until(2750); camera.clearInterrupt();
  camera.setInterruptLevels(4, -4, 0); camera.setInterruptMode(AMG88xx_DIFFERENCE); camera.clearInterrupt();
  until(3150); camera.getInterrupt(bitmap); check(bitmap[7] == 128, "stock-difference-mode");
  camera.getInterrupt(bitmap, 1); check(bitmap[0] == 0, "stock-partial-bitmap");
  until(3350); camera.clearInterrupt(); delay(150); check(readReg(4) == 0, "stock-difference-recovery");
  finish("stock-interrupts");
  Serial.print("failures "); Serial.println(failures);
}
void loop() {}
