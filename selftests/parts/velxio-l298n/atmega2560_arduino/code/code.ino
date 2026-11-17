void bridge(int enable, int first, int second, int code) {
  digitalWrite(enable, LOW);
  digitalWrite(first, code & 2 ? HIGH : LOW);
  digitalWrite(second, code & 1 ? HIGH : LOW);
  digitalWrite(enable, code & 4 ? HIGH : LOW);
}
void setup() {
  for (int pin = 5; pin <= 10; pin++) pinMode(pin, OUTPUT);
}
void loop() {
  const unsigned long time = millis();
  const int code = time / 500 % 8;
  static int previous = -1;
  if (code != previous) {
    bridge(7, 5, 6, code);
    bridge(10, 8, 9, 7 - code);
    previous = code;
  }
}
