#include <Wire.h>
#include "Adafruit_LTR390.h"

Adafruit_LTR390 ltr;

const uint8_t INT_PIN = 2;

volatile uint16_t events = 0;

void onThreshold() {
  events++;
}

void setup() {
  Serial.begin(9600);
  pinMode(INT_PIN, INPUT);
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
