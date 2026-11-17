// MPU6050 full-scale unit test sketch.
//
// Selects ±4g (ACCEL_CONFIG AFS_SEL=1) and ±500 deg/s (GYRO_CONFIG FS_SEL=1),
// then prints the raw accel/gyro words. The harness drives values above the
// ±2g default range, so the printed counts prove the part honours the
// configured scale instead of hardcoding ±2g:
//   accel raw = g * 8192,  gyro raw = deg/s * 65.5

#include <Wire.h>

const int MPU_ADDR = 0x68;

void writeReg(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission(true);
}

void setup() {
  Serial.begin(115200);
  Wire.begin();

  writeReg(0x6B, 0x00); // PWR_MGMT_1: wake
  writeReg(0x1B, 0x08); // GYRO_CONFIG: FS_SEL=1 (±500 deg/s)
  writeReg(0x1C, 0x08); // ACCEL_CONFIG: AFS_SEL=1 (±4g)
}

void loop() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 14, true);

  int16_t ax = Wire.read() << 8 | Wire.read();
  int16_t ay = Wire.read() << 8 | Wire.read();
  int16_t az = Wire.read() << 8 | Wire.read();
  Wire.read(); Wire.read();               // temperature, unused here
  int16_t gx = Wire.read() << 8 | Wire.read();
  int16_t gy = Wire.read() << 8 | Wire.read();
  int16_t gz = Wire.read() << 8 | Wire.read();

  Serial.print("aX: "); Serial.print(ax);
  Serial.print(" aY: "); Serial.print(ay);
  Serial.print(" aZ: "); Serial.print(az);
  Serial.print(" gX: "); Serial.print(gx);
  Serial.print(" gY: "); Serial.print(gy);
  Serial.print(" gZ: "); Serial.println(gz);

  delay(200);
}
