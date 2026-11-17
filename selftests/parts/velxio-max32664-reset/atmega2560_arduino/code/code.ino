// MAX32664 reset selftest: the hub reads MFIO as RST rises. Device mode after
// a reset with MFIO HIGH (0), with MFIO LOW (8, bootloader), after the
// exit-bootloader command (0), MFIO LOW again (8), MFIO as a pulled-up input (0).
#include <Wire.h>

const int RST_PIN = 4;
const int MFIO_PIN = 5;
const uint8_t HUB_ADDR = 0x55;

uint8_t hubReply(uint8_t count) {
  delay(6);
  Wire.requestFrom(HUB_ADDR, count);
  uint8_t status = Wire.read();
  uint8_t value = count > 1 ? Wire.read() : 0;
  return status ? 0xFF : value;
}

void printMode() {
  Wire.beginTransmission(HUB_ADDR);
  Wire.write(0x02);
  Wire.write(0x00);
  Wire.endTransmission();
  Serial.print("Mode: ");
  Serial.println(hubReply(2));
}

void resetPulse(unsigned long settleMs) {
  digitalWrite(RST_PIN, LOW);
  delay(10);
  digitalWrite(RST_PIN, HIGH);
  delay(settleMs);
}

void setup() {
  Serial.begin(9600);
  Wire.begin();
  pinMode(RST_PIN, OUTPUT);
  digitalWrite(RST_PIN, HIGH);
  pinMode(MFIO_PIN, OUTPUT);

  digitalWrite(MFIO_PIN, HIGH);
  resetPulse(1000);
  printMode();

  digitalWrite(MFIO_PIN, LOW);
  resetPulse(50);
  printMode();

  Wire.beginTransmission(HUB_ADDR);
  Wire.write(0x01);
  Wire.write(0x00);
  Wire.write(0x00);
  Wire.endTransmission();
  hubReply(1);
  printMode();

  resetPulse(50);
  printMode();

  pinMode(MFIO_PIN, INPUT_PULLUP);
  resetPulse(50);
  printMode();
}

void loop() {}
