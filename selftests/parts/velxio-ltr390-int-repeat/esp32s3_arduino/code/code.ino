// LTR390 INT re-arm unit test sketch (ESP32-S3 Arduino variant of code/code.ino).

#include <Wire.h>
#include "Adafruit_LTR390.h"

const int SDA_PIN = 38;
const int SCL_PIN = 39;
const uint8_t INT_PIN = 4;

Adafruit_LTR390 ltr;

volatile uint16_t events = 0;

void IRAM_ATTR onThreshold() {
  events++;
}

void setup() {
  Serial.begin(115200);
  pinMode(INT_PIN, INPUT);
  Wire.begin(SDA_PIN, SCL_PIN);
  if (!ltr.begin()) {
    while (1) delay(10);
  }
  ltr.setMode(LTR390_MODE_ALS);
  ltr.setGain(LTR390_GAIN_3);
  ltr.setResolution(LTR390_RESOLUTION_18BIT);
  ltr.setThresholds(1000, 50000);
  ltr.configInterrupt(true, LTR390_MODE_ALS);

  attachInterrupt(digitalPinToInterrupt(INT_PIN), onThreshold, FALLING);
}

void loop() {
  // Reading MAIN_STATUS releases INT, so the next out-of-range conversion
  // produces a fresh falling edge.
  ltr.newDataAvailable();

  noInterrupts();
  uint16_t n = events;
  interrupts();
  Serial.print("EV: ");
  Serial.println(n);
  delay(250);
}
