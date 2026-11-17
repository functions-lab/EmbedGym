// Membrane keypad, hand-rolled scan with high-impedance row parking.
//
// Rows idle as high-Z inputs; the scan drives one row OUTPUT LOW, reads the
// columns (INPUT_PULLUP), then parks the row back at pinMode(row, INPUT)
// before strobing the next. Idling at high-Z is the safer real-world pattern —
// two simultaneously pressed keys in one column can't short two driven rows.
// Correct on real hardware; reproduces the harness gap where a DDR-only
// release never reaches the part, so rows stay stale-"active"
// (plans/keypad-library-fix.md). Modeled on the failing safebox smoke sketch.

const int rowPins[4] = {30, 31, 32, 33};
const int colPins[4] = {34, 35, 36, 37};

const char keyMap[4][4] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'},
};

void setup() {
  for (int r = 0; r < 4; r++) {
    pinMode(rowPins[r], INPUT);
  }
  for (int c = 0; c < 4; c++) {
    pinMode(colPins[c], INPUT_PULLUP);
  }
  Serial.begin(115200);
}

void loop() {
  for (int r = 0; r < 4; r++) {
    pinMode(rowPins[r], OUTPUT);
    digitalWrite(rowPins[r], LOW);
    delayMicroseconds(50);
    for (int c = 0; c < 4; c++) {
      if (digitalRead(colPins[c]) == LOW) {
        Serial.print("Key Pressed: ");
        Serial.println(keyMap[r][c]);
        delay(50);
      }
    }
    pinMode(rowPins[r], INPUT);
  }
}
