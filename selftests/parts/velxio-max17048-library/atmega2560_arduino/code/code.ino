#include <Adafruit_MAX1704X.h>
#include <math.h>

Adafruit_MAX17048 gauge;
uint16_t failures = 0;
uint16_t sectionStart = 0;

void check(bool ok, const char *name) {
  if (!ok) { failures++; Serial.print("FAIL "); Serial.println(name); }
}
void finish(const char *name) {
  Serial.print(name); Serial.print(' '); Serial.println(failures - sectionStart);
  sectionStart = failures;
}
void waitUntil(unsigned long at) { while (millis() < at) {} }
void wordWrite(byte reg, uint16_t value) {
  Wire.beginTransmission(0x36); Wire.write(reg);
  Wire.write(value >> 8); Wire.write(value & 255);
  check(Wire.endTransmission() == 0, "raw-write");
}

void setup() {
  Serial.begin(9600);
  pinMode(2, INPUT);
  check(gauge.begin(), "begin");
  check(gauge.isDeviceReady(), "ready");
  check(gauge.getICversion() == 0x12, "version");
  check(gauge.getChipID() == 0x48, "factory-id");
  delay(300);
  check(fabs(gauge.cellVoltage() - 3.8) < 0.002, "voltage");
  check(fabs(gauge.cellPercent() - 50) < 0.01, "soc");
  check(fabs(gauge.chargeRate()) < 0.01, "rate");
  finish("stock-init");

  // Rev7 ignores 8-bit writes. These unchanged library setters issue them.
  gauge.setResetVoltage(3.2);
  check(fabs(gauge.getResetVoltage() - 0.88) < 0.01, "reset-voltage-byte-noop");
  gauge.setAlertVoltages(3.6, 4.2);
  float minv, maxv; gauge.getAlertVoltages(minv, maxv);
  check(fabs(minv) < 0.01 && fabs(maxv - 5.1) < 0.01, "voltage-alert-byte-noop");
  gauge.setActivityThreshold(0.1);
  check(fabs(gauge.getActivityThreshold() - 0.06) < 0.001, "activity-byte-noop");
  gauge.setHibernationThreshold(10);
  check(fabs(gauge.getHibernationThreshold() - 26.624) < 0.01, "hib-byte-noop");
  gauge.hibernate(); check(!gauge.isHibernating(), "hibernate-byte-noop");
  gauge.wake(); check(fabs(gauge.getActivityThreshold() - 0.06) < 0.001, "wake-byte-noop");
  gauge.quickStart(); check(gauge.cellPercent() != 0, "quick-byte-noop");
  check(gauge.clearAlertFlag(MAX1704X_ALERTFLAG_RESET_INDICATOR), "clear-byte-ack");
  check(gauge.getAlertStatus() == 1, "clear-byte-noop");
  finish("stock-byte-setters");

  waitUntil(1500);
  wordWrite(0x14, (195 << 8) | 200); delay(300);
  check(gauge.isActiveAlert(), "alert-active");
  check((gauge.getAlertStatus() & MAX1704X_ALERTFLAG_VOLTAGE_LOW) != 0, "alert-reason");
  check(digitalRead(2) == LOW, "alert-int");
  gauge.clearAlertFlag(MAX1704X_ALERTFLAG_VOLTAGE_LOW);
  check((gauge.getAlertStatus() & MAX1704X_ALERTFLAG_VOLTAGE_LOW) != 0, "clear-byte-noop-low");
  wordWrite(0x14, 0x00ff); wordWrite(0x1a, 0); wordWrite(0x0c, 0x971c);
  finish("stock-alert-getters");

  waitUntil(3000);
  gauge.enableSleep(true); gauge.sleep(true);
  waitUntil(4500);
  check(fabs(gauge.cellPercent() - 60) < 0.01, "sleep-enable-byte-noop");
  gauge.sleep(false);
  wordWrite(0x06, 0x2000); gauge.sleep(true);
  const float held = gauge.cellPercent();
  waitUntil(6500);
  check(gauge.cellPercent() == held, "sleep-word-config-hold");
  gauge.sleep(false); delay(1100);
  check(fabs(gauge.cellPercent() - 70) < 0.01, "sleep-word-wake");
  gauge.enableSleep(false);
  finish("stock-sleep");

  waitUntil(8000);
  check(fabs(gauge.chargeRate() + 9.984) < 0.01, "negative-rate");
  waitUntil(10000);
  check(fabs(gauge.chargeRate() - 9.984) < 0.01, "positive-rate");
  check(fabs(gauge.cellVoltage() - 4.1) < 0.002, "fresh-voltage");
  finish("stock-readings");

  check(gauge.reset(), "reset-nack-success");
  check(gauge.getAlertStatus() == 1, "reset-indicator-byte-noop");
  delay(300);
  check(gauge.cellPercent() > 69 && gauge.cellPercent() < 71, "reset-cell-retained");
  finish("stock-reset");
  Serial.print("failures "); Serial.println(failures);
}
void loop() {}
