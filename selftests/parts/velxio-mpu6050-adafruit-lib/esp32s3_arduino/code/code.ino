// MPU6050 driven through the Adafruit library rather than raw Wire
// (ESP32-S3 Arduino variant of code/code.ino).
// begin() prints its own verdict so a hang is distinguishable from a NACK:
// a hang produces no output at all, not even READY/NOINIT.
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>

const int SDA_PIN = 38;
const int SCL_PIN = 39;

Adafruit_MPU6050 mpu;
bool up = false;

void setup() {
  Serial.begin(115200);
  Wire.begin(SDA_PIN, SCL_PIN);
  Serial.println("BOOT");
  up = mpu.begin();
  Serial.println(up ? "READY" : "NOINIT");
}

void loop() {
  if (!up) {
    delay(200);
    return;
  }
  sensors_event_t a, g, t;
  mpu.getEvent(&a, &g, &t);
  Serial.print("aZ: ");
  Serial.println((int)(a.acceleration.z * 100));
  delay(200);
}
