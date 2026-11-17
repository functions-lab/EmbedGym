// Membrane keypad unit test sketch.
//
// The velxio part-sim models the keypad as: it watches ROW pins driven LOW,
// and when a pressed key sits in an active row it pulls that key's COLUMN pin
// LOW. So this sketch drives ROWS as outputs and reads COLUMNS as inputs —
// the transpose of a "column-scan" sketch. (KeypadScanner.ino scans the other
// way; that mismatch is the point of the integration test.)
//
// Scan: drive one row LOW at a time, read all columns; a LOW column means the
// key at (row, col) is pressed. Prints "Key Pressed: X".

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
    pinMode(rowPins[r], OUTPUT);
    digitalWrite(rowPins[r], HIGH);
  }
  for (int c = 0; c < 4; c++) {
    pinMode(colPins[c], INPUT_PULLUP);
  }
  Serial.begin(115200);
}

void loop() {
  for (int r = 0; r < 4; r++) {
    digitalWrite(rowPins[r], LOW);
    for (int c = 0; c < 4; c++) {
      if (digitalRead(colPins[c]) == LOW) {
        Serial.print("Key Pressed: ");
        Serial.println(keyMap[r][c]);
        delay(50);
      }
    }
    digitalWrite(rowPins[r], HIGH);
  }
}
