// The module runs BIT7 1, which suits an MCU UART in 7N2. SoftwareSerial is
// 8N1 only, so the sketch sends and reads the 7N2 wire image: an 8N1 frame
// whose MSB is the first stop bit. A clear MSB is a 7N2 framing error ('!').
#include <SoftwareSerial.h>

SoftwareSerial hm10(8, 7);

void setup() {
  Serial.begin(9600);
  hm10.begin(9600);
  hm10.write('A' | 0x80);
  hm10.write('T' | 0x80);
}

void loop() {
  while (hm10.available()) {
    const byte value = hm10.read();
    Serial.write((value & 0x80) ? (value & 0x7f) : '!');
  }
}
