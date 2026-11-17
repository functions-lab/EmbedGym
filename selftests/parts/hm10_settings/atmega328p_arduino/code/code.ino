// Full-duplex software UART to the module (RX pin 8, TX pin 7, 9600 baud).
// SoftwareSerial cannot receive while it transmits, and the wake burst is still
// being sent when the module answers OK+WAKE. Here one Timer1 interrupt, three
// ticks per bit, samples RX and shifts TX, so both directions run at once.

const uint8_t TICKS_PER_BIT = 3;

volatile uint8_t rxBuffer[256];
volatile uint8_t rxHead = 0;
uint8_t rxTail = 0;
uint8_t rxByte;
uint8_t rxBits;
uint8_t rxCountdown = 0;

volatile uint16_t txFrame;
volatile uint8_t txBitsLeft = 0;
uint8_t txTicks = 0;

ISR(TIMER1_COMPA_vect) {
  bool level = PINB & _BV(PB0);
  if (rxCountdown == 0) {
    // A low level while idle is a start bit; the first data bit's center is
    // 4 ticks away (the edge happened 0 to 1 tick ago).
    if (!level) {
      rxCountdown = TICKS_PER_BIT + 1;
      rxBits = 0;
    }
  } else if (--rxCountdown == 0) {
    if (rxBits < 8) {
      rxByte = (rxByte >> 1) | (level ? 0x80 : 0);
      rxBits++;
      rxCountdown = TICKS_PER_BIT;
    } else {
      rxBuffer[rxHead] = rxByte;
      rxHead++;
    }
  }

  if (txBitsLeft > 0) {
    if (txTicks == 0) {
      if (txFrame & 1) PORTD |= _BV(PD7);
      else PORTD &= ~_BV(PD7);
      txFrame >>= 1;
      txTicks = TICKS_PER_BIT;
    }
    if (--txTicks == 0) txBitsLeft--;
  }
}

void setup() {
  Serial.begin(9600);
  pinMode(8, INPUT);
  digitalWrite(7, HIGH);
  pinMode(7, OUTPUT);
  TCCR1A = 0;
  TCCR1B = _BV(WGM12) | _BV(CS10);
  OCR1A = F_CPU / (9600UL * TICKS_PER_BIT) - 1;
  TIMSK1 = _BV(OCIE1A);
}

void loop() {
  if (txBitsLeft == 0 && Serial.available()) {
    // Start bit (0) in bit 0, data LSB first, stop bit (1) in bit 9.
    txFrame = ((uint16_t)Serial.read() << 1) | 0x200;
    txBitsLeft = 10;
  }
  if (rxTail != rxHead) {
    Serial.write(rxBuffer[rxTail]);
    rxTail++;
  }
}
