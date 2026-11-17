// Arduino port of selftests/harness/app_start_serial. Serial
// timestamps must count from setup() entry, the origin `at` values use:
//
//   1. The first line prints 300 ms after setup() begins, so @n.t[0] lands near
//      300 on the app-relative axis, not near 560 where it sits on the
//      power-on axis.
//   2. ROM boot text leaves UART0 before app start and is replayed at negative
//      times; `parse` must bound its window below at t=0. The paired test
//      parses `entry {addr:s}`, which matches the ROM's `entry 0x…` line, so
//      the slot binds a value if that bound is missing.
const int FIRST_PRINT_MS = 300;
const int PERIOD_MS = 200;

unsigned long t0_ms;

void setup() {
  // millis() counts from power-on; the harness axis begins here.
  t0_ms = millis();
  Serial.begin(115200);
  delay(FIRST_PRINT_MS);
}

void loop() {
  static int n = 0;
  Serial.printf("N: %d T: %lu\n", n, millis() - t0_ms);
  Serial.println("TICK");
  n++;
  delay(PERIOD_MS);
}
