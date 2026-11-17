// PIR motion sensor unit test sketch.
//
// `set pir.trigger = true` drives OUT HIGH for exactly 3 s of *simulated* time
// (cycle-scheduled, not wall-clock), then back LOW. Print each edge so the
// test can assert both the rise and the fall.

const int PIR_PIN = 24;

int lastState = LOW;

void setup() {
  pinMode(PIR_PIN, INPUT);
  Serial.begin(115200);
}

void loop() {
  int state = digitalRead(PIR_PIN);
  if (state != lastState) {
    if (state == HIGH) {
      Serial.println("Motion started");
    } else {
      Serial.println("Motion ended");
    }
    lastState = state;
  }
}
