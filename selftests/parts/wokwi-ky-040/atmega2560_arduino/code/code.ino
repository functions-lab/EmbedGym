// KY-040 rotary encoder unit test sketch.
//
// The velxio part-sim drives CLK/DT in quadrature and SW active-low:
//   - clockwise step:         DT LOW  on the CLK rising edge
//   - counter-clockwise step: DT HIGH on the CLK rising edge
//   - button:                 SW LOW while pressed (HIGH idle)
//
// We sample DT on each CLK rising edge to move a counter, and reset it on an
// SW press. Prints "position: N" and "reset" so the test can assert via Serial.

const int PIN_CLK = 2;
const int PIN_DT = 3;
const int PIN_SW = 4;

int counter = 0;
int lastClk = HIGH;

void setup() {
  pinMode(PIN_CLK, INPUT_PULLUP);
  pinMode(PIN_DT, INPUT_PULLUP);
  pinMode(PIN_SW, INPUT_PULLUP);
  Serial.begin(115200);
  lastClk = digitalRead(PIN_CLK);
}

void loop() {
  int clk = digitalRead(PIN_CLK);
  if (clk != lastClk && clk == HIGH) {
    if (digitalRead(PIN_DT) == LOW) {
      counter++;
    } else {
      counter--;
    }
    Serial.print("position: ");
    Serial.println(counter);
  }
  lastClk = clk;

  if (digitalRead(PIN_SW) == LOW) {
    counter = 0;
    Serial.println("reset");
    delay(200);
  }
}
