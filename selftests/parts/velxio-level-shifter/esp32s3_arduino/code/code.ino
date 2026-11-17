// Level shifter unit test sketch (ESP32-S3 Arduino): the relay IN behind
// channel 1 follows pin 10, HIGH in even seconds (LV -> HV), and the HC-SR04
// ECHO behind channel 2 is timed every 200 ms (HV -> LV).

const int RELAY_PIN = 10;
const int TRIG_PIN = 5;
const int ECHO_PIN = 6;

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(TRIG_PIN, OUTPUT);
  digitalWrite(TRIG_PIN, LOW);
  pinMode(ECHO_PIN, INPUT);
}

void loop() {
  digitalWrite(RELAY_PIN, millis() / 1000 % 2 == 0 ? HIGH : LOW);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration > 0) Serial.printf("Distance: %lu cm\n", duration / 58);
  delay(200);
}
