// LCD1602 unit test sketch (parallel 4-bit mode via LiquidCrystal):
//   Prints "Hello World" starting at column 3, row 0, then walks the
//   backlight anode (pin 10) through digital HIGH → half PWM duty → off so
//   `backlightBrightness` can be asserted at each level.

#include <LiquidCrystal.h>

LiquidCrystal lcd(48, 49, 46, 47, 44, 45);

const int BACKLIGHT_PIN = 10;

void setup() {
  lcd.begin(16, 2);
  lcd.setCursor(3, 0);
  lcd.print("Hello World");

  pinMode(BACKLIGHT_PIN, OUTPUT);
  digitalWrite(BACKLIGHT_PIN, HIGH);
  delay(1000);
  analogWrite(BACKLIGHT_PIN, 64);
  delay(1000);
  analogWrite(BACKLIGHT_PIN, 0);
}

void loop() {}
