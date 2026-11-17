#include <Adafruit_HMC5883_U.h>
#include <math.h>

Adafruit_HMC5883_Unified compass(42);
const hmc5883MagGain gains[] = {
  HMC5883_MAGGAIN_1_3, HMC5883_MAGGAIN_1_9, HMC5883_MAGGAIN_2_5,
  HMC5883_MAGGAIN_4_0, HMC5883_MAGGAIN_4_7, HMC5883_MAGGAIN_5_6, HMC5883_MAGGAIN_8_1,
};
const float scalesXY[] = {1100, 855, 670, 450, 400, 330, 230};
const float scalesZ[] = {980, 760, 600, 400, 255, 295, 205};

void printReading(const char *prefix, byte gain) {
  sensors_event_t event;
  compass.getEvent(&event);
  Serial.print(prefix);
  Serial.print(' '); Serial.print(gain);
  Serial.print(' '); Serial.print(lround(event.magnetic.x * scalesXY[gain] / 100));
  Serial.print(' '); Serial.print(lround(event.magnetic.y * scalesXY[gain] / 100));
  Serial.print(' '); Serial.println(lround(event.magnetic.z * scalesZ[gain] / 100));
}

void setup() {
  Serial.begin(9600);
  // The library's begin() calls Wire.begin() without pins.
  Wire.setPins(38, 39);
  if (!compass.begin()) {
    Serial.println("library init failed");
    while (true) {}
  }
  sensor_t info;
  compass.getSensor(&info);
  Serial.print("sensor "); Serial.println(info.type == SENSOR_TYPE_MAGNETIC_FIELD);
  for (byte gain = 0; gain < 7; gain++) {
    compass.setMagGain(gains[gain]);
    delay(250);
    printReading("gain", gain);
  }
}

void loop() {
  printReading("field", 6);
  delay(500);
}
