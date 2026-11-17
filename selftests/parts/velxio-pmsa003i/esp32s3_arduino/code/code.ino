// PMSA003I unit test sketch (ESP32-S3 Arduino variant of code/code.ino):
//   Read PM1.0 / PM2.5 / PM10 standard and atmospheric concentrations
//   through the Adafruit_PM25AQI library every 200 ms. The harness pokes
//   `set air.pm1_0/pm2_5/pm10`, so all printed values must follow.
//   The library validates the 0x42 0x4D header and the frame checksum on
//   every read, so a single "read failed" print marks a malformed frame.

#include <Wire.h>
#include <Adafruit_PM25AQI.h>

const int SDA_PIN = 38;
const int SCL_PIN = 39;

Adafruit_PM25AQI aqi;

void setup() {
  Serial.begin(115200);
  Wire.begin(SDA_PIN, SCL_PIN);
  if (!aqi.begin_I2C()) {
    Serial.println("PMSA003I not found");
    while (1);
  }
}

void loop() {
  PM25_AQI_Data data;
  if (!aqi.read(&data)) {
    Serial.println("read failed");
  } else {
    Serial.print("PM1.0: ");
    Serial.print(data.pm10_standard);
    Serial.print(" PM2.5: ");
    Serial.print(data.pm25_standard);
    Serial.print(" PM10: ");
    Serial.println(data.pm100_standard);
    Serial.print("ATM1.0: ");
    Serial.print(data.pm10_env);
    Serial.print(" ATM2.5: ");
    Serial.print(data.pm25_env);
    Serial.print(" ATM10: ");
    Serial.println(data.pm100_env);
  }
  delay(200);
}
