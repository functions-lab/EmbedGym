#include <Wire.h>
unsigned failures = 0; unsigned checks = 0;
void check(bool valid, const char *name) { checks++; if (!valid) { Serial.print("FAIL "); Serial.println(name); failures++; } }
void writeReg(uint8_t reg, uint8_t value) { Wire.beginTransmission(0x5a); Wire.write(reg); Wire.write(value); check(Wire.endTransmission()==0, "write-ack"); }
uint8_t readReg(uint8_t reg) { Wire.beginTransmission(0x5a); Wire.write(reg); Wire.endTransmission(false); Wire.requestFrom(0x5a, 1); return Wire.read(); }
uint16_t readWord(uint8_t reg) { Wire.beginTransmission(0x5a); Wire.write(reg); Wire.endTransmission(false); Wire.requestFrom(0x5a, 2); uint8_t low=Wire.read(); return low | uint16_t(Wire.read())<<8; }
void until(unsigned long when) { while(millis()<when) delay(1); }
void configure(uint8_t control, uint8_t options=0) {
  writeReg(0x80, 0x63); writeReg(0x1e, 20); writeReg(0x5d, 0x20); writeReg(0x41, 12); writeReg(0x42, 6);
  writeReg(0x7b, control); writeReg(0x7c, options); writeReg(0x7d, 200); writeReg(0x7e, 130); writeReg(0x7f, 180); writeReg(0x5e, 0x41);
}
void setup() {
  Serial.begin(115200); Wire.begin(); pinMode(2, INPUT);
  for(uint8_t bva=0;bva<4;bva++) {
    configure(1 | (bva<<2)); delay(80); uint16_t data=readWord(4); uint16_t baseline=uint16_t(readReg(0x1e))<<2;
    check(data>=520 && data<=800, "auto-physical-range"); check(readReg(0x5f)>0, "auto-current"); check(readReg(2)==0, "auto-no-oor");
    if(bva==0) check(baseline==80, "bva-retain");
    if(bva==1) check(baseline==0, "bva-clear");
    if(bva==2) check(baseline%8==0 && baseline<=data && data-baseline<8, "bva-high-five");
    if(bva==3) check(baseline<=data && data-baseline<4, "bva-all-ten");
  }
  for(uint8_t code=0;code<4;code++) {
    configure((code<<6)|(code<<4)|0x0d, 0x80); delay(80);
    check(readReg(0x5f)>16, "auto-ffi-retry-current"); check(readReg(0x6c)==0, "scts-preserved-cdt"); check((readReg(3)&0xc0)==0, "auto-flags-clear");
  }
  configure(0x0f); writeReg(0x5e, 0); writeReg(0x2b, 1); writeReg(0x2c, 16); writeReg(0x5e, 0xc1); delay(80); uint8_t current=readReg(0x5f); uint8_t baseline=readReg(0x1e);
  until(1100); check(readWord(4)<520 && (readWord(0)&1), "held-below-lsl");
  check(readReg(0x5f)==current && readReg(0x1e)==baseline && readReg(2)==0, "are-preserves-touch");
  until(1450); check((readWord(0)&1)==0, "auto-touch-release");
  until(1650); check(readReg(0x5f)<current && readWord(4)>=520 && readWord(4)<=800, "are-baseline-drift-retunes");
  until(1800); configure(0xff, 0x87); delay(100);
  check(digitalRead(2)==LOW, "fault-irq"); check(readReg(2)==1 && (readReg(3)&0xc0)==0xc0, "auto-retry-failure-flags");
  delay(5); check(digitalRead(2)==LOW, "fault-irq-reassert");
  until(2300); check(readReg(2)==0 && (readReg(3)&0x40)==0, "are-recovery"); check(readReg(0x5f)>16, "are-recovery-physical-current");
  Serial.print("checks "); Serial.println(checks); Serial.print("failures "); Serial.println(failures);
}
void loop() {}
