// MPU6050 driven through the Adafruit library rather than raw Wire.
// begin() prints its own verdict so a hang is distinguishable from a NACK:
// a hang produces no output at all, not even READY/NOINIT.
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>

Adafruit_MPU6050 mpu;
bool up = false;

void setup() {
  Serial.begin(9600);
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
