// Shock sensor unit test sketch:
//   Count rising edges on the signal pin (each `set shock = true` fires one
//   50 ms HIGH pulse), print the running count, and print each pulse's width
//   on its falling edge.

const int SHOCK_PIN = 3;

int lastState = LOW;
int shocks = 0;
unsigned long riseMs = 0;

void setup() {
  Serial.begin(115200);
  pinMode(SHOCK_PIN, INPUT);
}

void loop() {
  int state = digitalRead(SHOCK_PIN);
  if (state == HIGH && lastState == LOW) {
    shocks++;
    riseMs = millis();
    Serial.print("Shocks: ");
    Serial.println(shocks);
  } else if (state == LOW && lastState == HIGH) {
    Serial.print("Pulse: ");
    Serial.print(millis() - riseMs);
    Serial.println(" ms");
  }
  lastState = state;
  delay(1);
}
