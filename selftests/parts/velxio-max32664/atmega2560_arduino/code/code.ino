#include <SparkFun_Bio_Sensor_Hub_Library.h>
#include <Wire.h>

int resPin = 4;
int mfioPin = 5;

SparkFun_Bio_Sensor_Hub bioHub(resPin, mfioPin);
bioData body;

void setup() {
  Serial.begin(9600);
  Wire.begin();

  int result = bioHub.begin();
  Serial.print("Begin: ");
  Serial.println(result);

  // Exercise the MAX30101 register path before the algorithm takes over.
  bioHub.setPulseWidth(411);
  bioHub.setSampleRate(400);
  bioHub.setAdcRange(16384);
  Serial.print("Width: ");
  Serial.println(bioHub.readPulseWidth());
  Serial.print("Rate: ");
  Serial.println(bioHub.readSampleRate());
  Serial.print("Range: ");
  Serial.println(bioHub.readAdcRange());

  bioHub.setAlgoRange(60);
  bioHub.setAlgoStepSize(12);
  Serial.print("AlgoRange: ");
  Serial.println(bioHub.readAlgoRange());
  Serial.print("AlgoStep: ");
  Serial.println(bioHub.readAlgoStepSize());

  // getMcuType() returns 255 for every nonzero MCU type: the library compares
  // the value against its success code and reports ERR_UNKNOWN when they
  // differ, so the hub's real 0x01 can never reach the caller.
  Serial.print("Mcu: ");
  Serial.println(bioHub.getMcuType());

  int error = bioHub.configBpm(MODE_TWO);
  Serial.print("Config: ");
  Serial.println(error);
}

void loop() {
  body = bioHub.readBpm();
  Serial.print("HR: ");
  Serial.print(body.heartRate);
  Serial.print(" Conf: ");
  Serial.print(body.confidence);
  Serial.print(" O2: ");
  Serial.print(body.oxygen);
  Serial.print(" Status: ");
  Serial.print(body.status);
  Serial.print(" R: ");
  Serial.println(body.rValue, 1);
  delay(500);
}
