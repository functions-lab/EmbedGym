// Active buzzer unit test sketch:
//   t = 0     pin LOW
//   t = 500   pin HIGH, held for 2 s (an active buzzer sounds for the whole
//             DC level, unlike the passive buzzer's single click)
//   t = 2500  pin LOW
//   t = 3000  100 ms HIGH pulse

const int BUZZER_PIN = 9;

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
