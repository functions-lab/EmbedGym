// Buzzer unit test sketch:
//   t = 0      tone ON  at 1 kHz on pin 11
//   t = 1000   tone OFF
//   t = 2000   tone ON  at 2 kHz
//   t = 3000   tone OFF (loops back)
//
// Mega Timer2 OC2A is pin 10; tone() on AVR uses Timer2 too, on any pin via
// software toggling. Pin 11 is fine — the buzzer hook subscribes to PWM duty
// changes via PinManager, which the avr8js tone() implementation exercises.

const int BUZZER_PIN = 11;

void setup() {
  pinMode(BUZZER_PIN, OUTPUT);
}

void loop() {
  tone(BUZZER_PIN, 1000);
  delay(1000);
  noTone(BUZZER_PIN);
  delay(1000);
  tone(BUZZER_PIN, 2000);
  delay(1000);
  noTone(BUZZER_PIN);
  delay(1000);

  // Slow beeps (500 ms period → ~2 pulses/s), then fast (125 ms → ~8/s):
  // `pulseRate` counts tone starts in the trailing second of sim time.
  for (int i = 0; i < 4; i++) {
    tone(BUZZER_PIN, 1500);
    delay(100);
    noTone(BUZZER_PIN);
    delay(400);
  }
  for (int i = 0; i < 16; i++) {
    tone(BUZZER_PIN, 1500);
    delay(50);
    noTone(BUZZER_PIN);
    delay(75);
  }
  while (true) {}
}
