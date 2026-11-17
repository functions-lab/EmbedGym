// VL53L0X unit test sketch (ESP32-S3 Arduino variant of code/code.ino).

#include <Wire.h>
#include "Adafruit_VL53L0X.h"

const int SDA_PIN = 38;
const int SCL_PIN = 39;

Adafruit_VL53L0X lox;

void setup() {
  Serial.begin(115200);
  Wire.begin(SDA_PIN, SCL_PIN);
  if (!lox.begin()) {
    Serial.println("init failed");
    while (1) delay(10);
  }
  lox.setMeasurementTimingBudgetMicroSeconds(200000);

  for (int i = 0; i < 5; i++) {
    VL53L0X_RangingMeasurementData_t m;
    lox.rangingTest(&m, false);
    if (m.RangeStatus != 4) {
      Serial.print("S ");
      Serial.print(m.RangeMilliMeter);
      Serial.println(" mm");
    } else {
      Serial.println("S out of range");
    }
    delay(200);
  }

  lox.startRangeContinuous(300);
}

void loop() {
  if (lox.isRangeComplete()) {
    Serial.print("C ");
    Serial.println(lox.readRangeResult());
  }
}
