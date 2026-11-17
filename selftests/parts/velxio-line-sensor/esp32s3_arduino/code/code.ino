// The 5 V sensor's L/M/R reach pins 12..14 through level-shifter channels.
// Pin 13 keeps its internal pull-up, which the shifter's LV pull-up dominates.
void setup() {
  Serial.begin(115200);
  pinMode(12, INPUT);
  pinMode(13, INPUT_PULLUP);
  pinMode(14, INPUT);
}
void loop() {
  Serial.printf("Bits %d%d%d\n", digitalRead(12), digitalRead(13), digitalRead(14));
  delay(100);
}
