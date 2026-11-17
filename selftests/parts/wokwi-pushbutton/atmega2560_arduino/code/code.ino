// Pushbutton unit test sketch.
//
// The velxio part-sim seeds the input pin HIGH (INPUT_PULLUP emulation) and
// drives it LOW while the button is held — i.e. the button is active-low with
// one leg on pin 2 and the other on GND. We read pin 2 and print a line on
// each press / release edge so the test can assert via Serial, alongside the
// element's own `pressed` property.

const int BUTTON_PIN = 2;

int lastState = HIGH;

void setup() {
  pinMode(BUTTON_PIN, INPUT);
  Serial.begin(115200);
}

void loop() {
  int state = digitalRead(BUTTON_PIN);
  if (state != lastState) {
    if (state == LOW) Serial.println("Button Pressed!");
    else Serial.println("Button Released!");
    lastState = state;
  }
}
