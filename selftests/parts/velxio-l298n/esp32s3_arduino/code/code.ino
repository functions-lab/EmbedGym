const int IN1 = 4, IN2 = 5, ENA = 6, IN3 = 7, IN4 = 15, ENB = 16;
unsigned long t0;

void bridge(int enable, int first, int second, int code) {
  digitalWrite(enable, LOW);
  digitalWrite(first, code & 2 ? HIGH : LOW);
  digitalWrite(second, code & 1 ? HIGH : LOW);
  digitalWrite(enable, code & 4 ? HIGH : LOW);
}
void setup() {
  t0 = millis();
  const int pins[] = {IN1, IN2, ENA, IN3, IN4, ENB};
  for (int pin : pins) pinMode(pin, OUTPUT);
}
void loop() {
  const int code = (millis() - t0) / 500 % 8;
  static int previous = -1;
  if (code != previous) {
    bridge(ENA, IN1, IN2, code);
    bridge(ENB, IN3, IN4, 7 - code);
    previous = code;
  }
}
