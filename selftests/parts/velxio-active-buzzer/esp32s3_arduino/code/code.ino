// Active buzzer unit test sketch (ESP32-S3 Arduino variant of code/code.ino):
//   LOW until 500 ms, HIGH 500-2500 ms, LOW until 3000 ms, then a 100 ms HIGH pulse.

const int BUZZER_PIN = 10;

void setup() {
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  delay(500);
  digitalWrite(BUZZER_PIN, HIGH);
  delay(2000);
  digitalWrite(BUZZER_PIN, LOW);
  delay(500);
  digitalWrite(BUZZER_PIN, HIGH);
  delay(100);
  digitalWrite(BUZZER_PIN, LOW);
}

void loop() {}
