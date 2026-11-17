#include <Wire.h>
unsigned failures = 0; unsigned checks = 0;
void check(bool valid, const char *name) { checks++; if (!valid) { Serial.print("FAIL "); Serial.println(name); failures++; } }
void writeReg(uint8_t reg, uint8_t value) { Wire.beginTransmission(0x5a); Wire.write(reg); Wire.write(value); check(Wire.endTransmission() == 0, "write-ack"); }
uint8_t readReg(uint8_t reg) { Wire.beginTransmission(0x5a); Wire.write(reg); Wire.endTransmission(false); Wire.requestFrom(0x5a, 1); return Wire.read(); }
void settle() { delay(2); }
void level(uint8_t gpio, bool high, const char *name) { settle(); check(digitalRead(gpio) == high, name); }
void setup() {
  Serial.begin(115200); Wire.begin(); for (uint8_t pin = 22; pin < 30; pin++) pinMode(pin, INPUT);
  writeReg(0x80, 0x63); writeReg(0x76, 0xff); writeReg(0x75, 0); writeReg(0x77, 0xff);
  for (uint8_t i = 0; i < 8; i++) { writeReg(0x78, 1 << i); level(22+i, true, "pushpull-high"); writeReg(0x79, 1 << i); level(22+i, false, "pushpull-low"); }
  writeReg(0x7a, 0xff); settle(); check(readReg(0x75) == 0xff, "toggle-data");
  writeReg(0x7a, 0xff); settle(); check(readReg(0x78) == 0, "toggle-clear");
  writeReg(0x77, 0); writeReg(0x76, 0); pinMode(22, OUTPUT); digitalWrite(22, LOW); writeReg(0x77, 1); settle(); check((readReg(0x75) & 1) == 0, "divided-input-low");
  digitalWrite(22, HIGH); settle(); check((readReg(0x75) & 1) == 1, "divided-input-high");
  writeReg(0x77, 0); pinMode(22, INPUT);
  writeReg(0x73, 0xf0); writeReg(0x74, 0xf0); writeReg(0x77, 0xf0); settle(); check((readReg(0x75) & 0xf0) == 0xf0, "input-pullup");
  writeReg(0x73, 0); settle(); check((readReg(0x75) & 0xf0) == 0, "input-pulldown"); writeReg(0x77, 0);
  writeReg(0x74, 4); writeReg(0x76, 4); writeReg(0x75, 4); writeReg(0x77, 4); level(24, true, "low-drain-release"); writeReg(0x79, 4); level(24, false, "low-drain-active"); writeReg(0x78, 4); level(24, true, "low-drain-rerelease");
  writeReg(0x77, 0); writeReg(0x73, 8); writeReg(0x74, 8); writeReg(0x76, 8); writeReg(0x75, 0); writeReg(0x77, 8); level(25, false, "high-drain-release"); writeReg(0x78, 8); level(25, true, "high-drain-active"); writeReg(0x79, 8); level(25, false, "high-drain-rerelease");
  writeReg(0x77, 0); writeReg(0x73, 0); writeReg(0x74, 0); writeReg(0x76, 0xff); writeReg(0x75, 0xff); writeReg(0x77, 0xff);
  for (uint8_t code = 1; code <= 15; code++) {
    writeReg(0x81, code | (code << 4)); writeReg(0x82, code | (code << 4)); writeReg(0x83, code | (code << 4)); writeReg(0x84, code | (code << 4)); delay(20);
    unsigned edges[8] = {}; unsigned highs[8] = {}; bool previous[8]; for (uint8_t i=0; i<8; i++) previous[i]=digitalRead(22+i);
    unsigned samples=0; unsigned long start=micros();
    while (micros()-start < 64000) {
      for (uint8_t i=0; i<8; i++) { bool high=digitalRead(22+i); highs[i]+=high; if(high!=previous[i]) {edges[i]++;previous[i]=high;} } samples++;
    }
    for (uint8_t i=0; i<8; i++) {
      check(edges[i]>=14 && edges[i]<=18, "pwm-125hz");
      float duty=float(highs[i])/samples; check(duty>float(code)/16-0.03 && duty<float(code)/16+0.03, "pwm-duty");
    }
  }
  for (uint8_t reg=0x81; reg<=0x84; reg++) writeReg(reg, 0); delay(10);
  for (uint8_t i=0;i<8;i++) check(digitalRead(22+i)==HIGH, "pwm-zero-steady");
  writeReg(0x79, 0xff); settle(); for (uint8_t i=0;i<8;i++) check(digitalRead(22+i)==LOW, "pwm-zero-data");
  writeReg(0x75, 0xff); writeReg(0x5d, 0x20); writeReg(0x5e, 0xc5); level(22, false, "sensing-overrides-gpio");
  writeReg(0x5e, 0xc4); level(22, true, "sensing-restores-gpio");
  writeReg(0x5e, 0xf4); level(22, false, "proximity-overrides-gpio");
  writeReg(0x5e, 0xd4); level(22, true, "short-proximity-keeps-gpio");
  writeReg(0x5e, 0); writeReg(0x5c, 0xd0); writeReg(0x5d, 0xe0);
  for (uint8_t reg=0x81; reg<=0x84; reg++) writeReg(reg, 0x88); writeReg(0x5e, 0xc1); delay(30);
  unsigned transitions=0; bool jitter=false; bool previous=digitalRead(23); unsigned long start=micros(), last=start;
  while(micros()-start<100000) {
    bool high=digitalRead(23); if(high!=previous) {
      unsigned long now=micros(); if(transitions) { unsigned long gap=now-last; if(gap<3800 || gap>4200) jitter=true; check(gap>=2000 && gap<=6500, "conversion-deferred-edge"); }
      transitions++; last=now; previous=high;
    }
  }
  check(transitions>=20 && transitions<=28 && jitter, "conversion-inhibits-pwm");
  writeReg(0x5e, 0);
  Serial.print("checks "); Serial.println(checks); Serial.print("failures "); Serial.println(failures);
}
void loop() {}
