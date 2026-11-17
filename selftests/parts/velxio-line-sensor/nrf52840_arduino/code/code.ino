// The 5 V sensor's L/M/R reach P1.10..P1.12 through level-shifter channels.
// P1.11 keeps its internal pull-up, which the shifter's LV pull-up dominates.
void setup() {
  Serial.begin(115200);
  pinMode(P1_10, INPUT);
  pinMode(P1_11, INPUT_PULLUP);
  pinMode(P1_12, INPUT);
}
void loop() {
  Serial.print("Bits "); Serial.print(digitalRead(P1_10));
  Serial.print(digitalRead(P1_11)); Serial.println(digitalRead(P1_12));
  delay(100);
}
