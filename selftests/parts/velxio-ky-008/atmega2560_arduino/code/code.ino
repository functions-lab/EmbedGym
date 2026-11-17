// KY-008 unit test sketch:
//   Toggle the laser's signal pin every second. The harness samples the
//   element's `laserOn` property mid-phase, so it must track the pin.

const int LASER_PIN = 8;

void setup() {
  pinMode(LASER_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LASER_PIN, HIGH);
  delay(1000);
  digitalWrite(LASER_PIN, LOW);
  delay(1000);
}
