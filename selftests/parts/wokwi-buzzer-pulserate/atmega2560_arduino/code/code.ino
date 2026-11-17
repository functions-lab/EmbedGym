// Buzzer pulseRate repro: a tone held longer than the part's silence
// window is counted as two beeps instead of one.
//
// Two phases, each 2 s, both beeping at exactly 4 beeps/sec:
//   t = 0     ON 30 ms / OFF 220 ms  — ON below the window at the time (50 ms)
//   t = 2000  ON 80 ms / OFF 170 ms  — ON above it, same repetition rate
//
// pulseRate counts tone onsets in the trailing second, so both phases must
// read 4. The second phase reads ~8: `lastToneCycles` only advances at onset,
// so the note self-retires one window in and the next square-wave edge registers as
// a fresh beep. The observable ends up measuring ON-phase duration rather than
// repetition rate — which is what inverted reverse_parking_sensor's counts.

const int BUZZER_PIN = 11;

void beep(int onMs, int offMs) {
  tone(BUZZER_PIN, 1500);
  delay(onMs);
  noTone(BUZZER_PIN);
  delay(offMs);
}

void setup() {
  pinMode(BUZZER_PIN, OUTPUT);
}

void loop() {
  for (int i = 0; i < 8; i++) beep(30, 220);
  for (int i = 0; i < 8; i++) beep(80, 170);
  while (true) {}
}
