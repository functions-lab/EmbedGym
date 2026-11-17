#include <Wire.h>
void setup() {
  Serial.begin(115200); Wire.begin(); pinMode(2, INPUT); unsigned failures=0;
  for(uint8_t address=0x5a;address<=0x5d;address++) { Wire.beginTransmission(address); if(Wire.endTransmission()==0) failures++; }
  Wire.beginTransmission(0x5a); Wire.write(0x80); Wire.write(0x63); if(Wire.endTransmission()==0) failures++;
  if(Wire.requestFrom(0x5a,1)!=0) failures++;
  Serial.print("failures "); Serial.println(failures);
}
void loop() {}
