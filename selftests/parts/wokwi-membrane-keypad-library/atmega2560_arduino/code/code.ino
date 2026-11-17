// Membrane keypad via Keypad.h — the de facto standard Arduino keypad library.
//
// Keypad.h scans the transpose of the part-sim's supported idiom: it holds the
// ROW pins as INPUT_PULLUP and strobes one COLUMN at a time (OUTPUT LOW, then
// parked back at INPUT). Correct on real hardware; reproduces the harness gap
// where the part only understands row-driven, push-pull scans
// (plans/keypad-library-fix.md).

#include <Keypad.h>

const byte ROWS = 4;
const byte COLS = 4;

char keys[ROWS][COLS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'},
};

byte rowPins[ROWS] = {30, 31, 32, 33};
byte colPins[COLS] = {34, 35, 36, 37};

Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

void setup() {
  Serial.begin(115200);
}

void loop() {
  char key = keypad.getKey();
  if (key != NO_KEY) {
    Serial.print("Key Pressed: ");
    Serial.println(key);
  }
}
