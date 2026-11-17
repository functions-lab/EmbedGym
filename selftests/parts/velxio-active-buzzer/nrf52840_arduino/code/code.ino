// Active buzzer: LOW until 500 ms, HIGH 500-2500 ms, LOW 2500-3000 ms,
// a 100 ms HIGH pulse at 3000 ms, then LOW.

const int BUZZER_PIN = P1_15;

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
