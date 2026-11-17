// The phone switches the module to 8E2 (AT+PARI1, AT+STOP1, AT+RESET).
// SoftwareSerial is 8N1 only, so this sketch bit-bangs 8E2 at 9600 baud on
// D8 (from the module's TXD) and D7 (to its RXD), and prints '!' for a frame
// with a parity or stop-bit error. Echoes go out once the module has been
// quiet for 2 ms, since a bit-banged UART cannot receive while it transmits.

const uint8_t RX_BIT = _BV(0);  // D8 = PB0
const uint8_t TX_BIT = _BV(7);  // D7 = PD7

byte echo[64];
int echoLength = 0;
unsigned long lastModuleByte = 0;

// 16 MHz / 9600 = 1667 cycles per bit; the loop bodies below take about 12 of them.
#define BIT_DELAY() __builtin_avr_delay_cycles(1655)

void sendFrame(byte value) {
  // Start bit, 8 data bits LSB first, even parity, 2 stop bits.
  uint16_t frame = ((uint16_t)value << 1) | ((uint16_t)__builtin_parity(value) << 9) | (3 << 10);
  const uint8_t sreg = SREG;
  cli();
  for (uint8_t i = 0; i < 12; i++) {
    if (frame & 1) PORTD |= TX_BIT;
    else PORTD &= ~TX_BIT;
    frame >>= 1;
    BIT_DELAY();
  }
  SREG = sreg;
}

// Called just after the start bit's falling edge; samples every bit at its center.
int receiveFrame() {
  const uint8_t sreg = SREG;
  cli();
  __builtin_avr_delay_cycles(800);
  uint16_t bits = 0;
  for (uint8_t i = 0; i < 12; i++) {
    if (PINB & RX_BIT) bits |= 1 << i;
    if (i < 11) BIT_DELAY();
  }
  SREG = sreg;
  const byte value = (bits >> 1) & 0xff;
  const bool parity = (bits >> 9) & 1;
  if ((bits & 1) != 0 || parity != __builtin_parity(value) || ((bits >> 10) & 3) != 3) return -1;
  return value;
}

void setup() {
  Serial.begin(9600);
  pinMode(8, INPUT);
  digitalWrite(7, HIGH);
  pinMode(7, OUTPUT);
}

void loop() {
  if ((PINB & RX_BIT) == 0) {
    const int value = receiveFrame();
    if (value < 0) {
      Serial.write('!');
    } else {
      Serial.write((byte)value);
      if (echoLength < (int)sizeof(echo)) echo[echoLength++] = value;
    }
    lastModuleByte = micros();
    return;
  }
  if (echoLength > 0 && micros() - lastModuleByte >= 2000) {
    for (int i = 0; i < echoLength; i++) sendFrame(echo[i]);
    echoLength = 0;
  }
}
