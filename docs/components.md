# Components — task-author reference

Each entry lists a component's `part` value for `test.jsonl`, its pin labels for `circuit.ts`, and the expressions to drive, supply, or observe it. See `selftests/parts/<tag>/` for working examples and [tasks-and-tests.md](tasks-and-tests.md) for the test format.

## Conventions

All names in `circuit.ts` and `test.jsonl` are case-sensitive:
- **Component ID (`metadataId`)**: The unprefixed part name (such as `led` or `hc-sr04`), which is also the `part` value in `test.jsonl`.
- **Roles and pin labels**: `<role>` is the name a `test.jsonl` circuit row gives the part. Wire `pinName` values must match the pin labels listed below.
- **Ratiometric analog outputs**: An analog output given as a fraction of `VCC` acts as a voltage divider between `VCC` and `GND`. Wire `GND` to ground and `VCC` to the board's logic rail (`5V` on `atmega2560_arduino`, `3V3.1` on `esp32s3_espidf`, `VDD` on `nrf52840_zephyr`); leaving either unwired leaves the output floating.
- **5 V protection**: On `esp32s3_*` and `nrf52840_*`, `5V` is a 5 V rail and GPIOs are not 5 V tolerant. Route any 5 V-powered part's output to a GPIO through a `level-shifter` channel.

Target support per entry:
- `implemented`: Targets with a passing self-test under `selftests/parts/<tag>/<target>/`.
- `verified`: Targets where a benchmark task using the part has also passed.
- Any target omitted from both lines is unsupported for that component.

Test expressions:
- `set <role>.<prop> = <v>`: Sets a sensor input property.
- `do <role>.<verb>` / `do <role>.<key>.<verb>`: Triggers a component action.
- `expect`: Checks a component property (`==`, `<`, `<=`, `>`, `>=`, `contains`) or a slot expression over values bound by `parse` or `capture`.

## Entry template

New entries follow this template. This template must be strictly followed without additional information. Do not add any implementation notes here.

```markdown
### <Display name>
- metadataId: `<id>`
- pins: <label> (<function>), ...
- wiring / drive / supply / observe / timing / power-on (optional)
- unit test: selftests/parts/<tag>/
- implemented: <target>, ...
- verified: <target>, ...
```

## Inputs

### Pushbutton (tactile switch)
- metadataId: `pushbutton`
- pins: `1.l`, `1.r`, `2.l`, `2.r` — `1.l` and `1.r` are connected, `2.l` and `2.r` are connected; pressing connects 1 to 2
- drive: `do <role>.down` / `<role>.up`
- observe: `expect <role>.pressed == true|false`
- unit test: `selftests/parts/wokwi-pushbutton/`
- implemented: atmega2560_arduino
- verified: esp32s3_espidf, nrf52840_zephyr

### Bounce button (tactile switch with contact bounce)
- metadataId: `bounce-button`
- pins: `1.l`, `1.r`, `2.l`, `2.r` — `1.l` and `1.r` are connected, `2.l` and `2.r` are connected; pressing connects 1 to 2
- drive: `do <role>.down` / `<role>.up`
- timing: Each press and release bounces: from when the new level lands, the pin returns to the old level at 1.5 ms, reaches the new level at 3.0 ms, returns at 4.0 ms, and settles at 4.8 ms.
- observe: `expect <role>.pressed == true|false`
- unit test: `selftests/parts/velxio-bounce-button/`
- implemented: atmega2560_arduino, esp32s3_espidf, nrf52840_zephyr

### Membrane keypad
- metadataId: `membrane-keypad`
- pins: `R1`–`R4` (rows), `C1`–`C4` (columns)
- drive: `do <role>.<key>.down` / `<role>.<key>.up` (`<key>`: `0`–`9`, `A`–`D`, `*`, `#`)
- unit test: `selftests/parts/wokwi-membrane-keypad/`, `wokwi-membrane-keypad-interrupt/` (GPIOTE edge interrupts, nRF only), `wokwi-membrane-keypad-tristate/`, `wokwi-membrane-keypad-library/`, `wokwi-membrane-keypad-busy-scan/` (scan with no delay, nRF only)
- implemented: atmega2560_arduino
- verified: esp32s3_espidf, nrf52840_zephyr

### KY-020 tilt switch
- metadataId: `ky-020-tilt-switch`
- pins: `S` (digital out), `V` (supply), `G` (ground)
- drive: `set <role>.tilted = true|false` (`true` = closed, `S` HIGH)
- unit test: `selftests/parts/velxio-ky-020-tilt-switch/`
- verified: atmega2560_arduino, esp32s3_espidf, nrf52840_zephyr

### KY-040 rotary encoder
- metadataId: `ky-040`
- pins: `CLK` (quadrature A), `DT` (quadrature B), `SW` (button, active-low), `VCC`, `GND`
- drive: `do <role>.clockwiseStep` / `<role>.counterClockwiseStep` (one quadrature detent per row: four edges 12.5 ms apart, with the leading pin falling at the row or 50 ms after an in-progress detent started); `do <role>.press` / `<role>.release`
- unit test: `selftests/parts/wokwi-ky-040/`
- verified: atmega2560_arduino, esp32s3_espidf, nrf52840_zephyr

## Outputs

### LED
- metadataId: `led`
- pins: `A` (anode — signal), `C` (cathode — `GND`; series resistor supported)
- observe: `expect <role>.value == true|false`; `<role>.brightness` (0–1: PWM duty when PWM-driven, else 0 or 1; compare with `<`, `>`, or a `capture`)
- unit test: `selftests/parts/wokwi-led/` (incl. series resistor pass-through)
- implemented: atmega2560_arduino, esp32s3_espidf
- verified: esp32s3_arduino, nrf52840_zephyr

### Buzzer
- metadataId: `buzzer`
- pins: `1` (positive — signal), `2` (negative — `GND`)
- observe: `expect <role>.hasSignal == true|false` (passive buzzer: requires a drive waveform such as a `tone()` square wave; a held DC level is a single click, not a signal); `expect <role>.frequency == <Hz>` (`0` if off); `<role>.pulseRate` (tone starts in the last 1 s, where a start is an onset after ≥ 10 ms without drive edges; compare with `<`, `>`, or a `capture` to grade beep-rate scaling)
- unit test: `selftests/parts/wokwi-buzzer/`, `selftests/parts/wokwi-buzzer-pwm/` (`&pwm0`, nRF only), `wokwi-buzzer-dc/`, `wokwi-buzzer-pulserate/`
- implemented: atmega2560_arduino
- verified: esp32s3_espidf, nrf52840_zephyr

### Active buzzer
- metadataId: `active-buzzer`
- pins: `1` (positive — signal), `2` (negative — `GND`)
- wiring: pin `1` directly to a digital GPIO (`9` on `atmega*`, `10` on `esp32s3_*`, `P1.15` on `nrf52840_*`; no level shifter); pin `2` to `GND` (`GND.1` on `esp32s3_*` and `nrf52840_*`)
- observe: `expect <role>.sounding == true|false` (`true` while pin `1` is HIGH)
- unit test: `selftests/parts/velxio-active-buzzer/`
- implemented: esp32s3_arduino, esp32s3_espidf, nrf52840_arduino, nrf52840_zephyr
- verified: atmega2560_arduino

### KY-008 laser emitter
- metadataId: `ky-008`
- pins: `signal` (logic in — digital board pin), `VCC`, `GND`
- observe: `expect <role>.laserOn == true|false`
- unit test: `selftests/parts/velxio-ky-008/`
- verified: atmega2560_arduino, esp32s3_espidf, nrf52840_zephyr

### Relay module
- metadataId: `relay-module`
- pins: `IN` (logic in — digital board pin), `VCC`, `GND`, `NO`, `COM`, `NC` (contacts)
- observe: `expect <role>.energized == true|false`
- unit test: `selftests/parts/velxio-relay-module/`
- verified: atmega2560_arduino, esp32s3_arduino, esp32s3_espidf, nrf52840_zephyr

### DRV2605L haptic driver with ERM motor (Adafruit 2305, I2C)
- metadataId: `drv2605l`
- pins: `SDA`, `SCL` (I2C, fixed address `0x5A`), `VIN` (3–5 V; `SDA`/`SCL` pull up to `VIN`), `GND`, `INT` (IN/TRIG; leave unwired) — the ERM coin motor is built in
- wiring: `SDA`/`SCL` to `20`/`21` on `atmega2560_arduino`, `A4`/`A5` on `atmega328p_arduino`, `38`/`39` on `esp32s3_*`, `P0.21`/`P0.27` (`i2c0`) on `nrf52840_*`; `VIN` to `5V` on `atmega*`, `3V3` on `esp32s3_*`, `VDD` on `nrf52840_*`
- observe: `vibrating` (motor driven: effect, diagnostics, calibration, or nonzero RTP level), `drive` (RTP level −128…127, `0` outside active RTP mode; unsigned format maps 128 to 0), `effectCount`, `lastEffect` (`0` before the first), `lastEffectMs` (start of the last effect in ms from the time origin, `−1` before the first), `effects` (started effect IDs in order, space-separated), `go`, `standby`, `mode`, `library`
- timing: Each ROM effect lasts its library's longest rise plus longest brake time (datasheet Table 1: A 100 ms, B 75 ms, C 100 ms, D 165 ms, F 65 ms); `WAIT` slots take 10 ms per step; `GO` clears when the sequence ends. Diagnostics take 100 ms and auto-calibration takes the `AUTO_CAL_TIME` maximum (700 ms by default); both pass.
- power-on: standby, mode `0`, library A; reset register values: `0x04 = 0x00`, `0x19 = 0x6F`, `0x20 = 0x00`
- unit test: `selftests/parts/velxio-drv2605l/`
- implemented: esp32s3_arduino, esp32s3_espidf, nrf52840_arduino, nrf52840_zephyr
- verified: atmega2560_arduino

### LCD1602 (parallel / HD44780)
- metadataId: `lcd1602`
- pins: `RS`, `RW` (unwired is treated as `GND`), `E` (control), `D0`–`D7` (data; 4-bit mode uses `D4`–`D7`), `VDD`, `VSS` (supply), `V0` (contrast), `A`, `K` (backlight anode/cathode)
- observe: `expect <role>.row0|row1 == '<string>'` (one row of `text`, trailing spaces trimmed; also supports `contains` and `parse "from"`); `expect <role>.text contains '<string>'` (`text` is space-padded to 32 chars — prefer `contains`); `<role>.backlightBrightness` (0–1: PWM duty on `A` when PWM-driven, else 0 or 1; compare with `<`, `>`, or a `capture`)
- timing: HD44780U typical. Any write started while the controller is busy is lost: until 15 ms after power-on (5 V supply), 4.1 ms / 100 µs after the first / second Function Set, 1.52 ms after Clear / Return Home, and 37 µs after anything else. A 4-bit write starts at its first nibble. Power-on is 65 ms before cycle 0 on `atmega2560_arduino` (fuse start-up delay) and at reset elsewhere.
- power-on: display off (all cells blank), 1-line mode (`row1` blank until Function Set with `N=1`), increment mode (Clear also restores increment)
- display: CGRAM writes (after Set CGRAM Address) leave DDRAM untouched; custom characters read back as `U+0000`–`U+000F` (trailing `U+0000` is trimmed from `row<N>`). Display shift and entry-mode shift move the visible window.
- unit test: `selftests/parts/wokwi-lcd1602/`, `wokwi-lcd1602-controller/` (busy loss, display off, CGRAM, shift)
- implemented: atmega2560_arduino
- verified: esp32s3_espidf, nrf52840_zephyr

## Sensors

### KY-023 joystick
- metadataId: `joystick`
- pins: `VRx`, `VRy` (analog out — 0 V at 0, `VCC` at 1023, linear; wire to an `A<N>` board pin, or an AIN pin `P0.02`–`P0.04` / `P0.28`–`P0.31` on `nrf52840_zephyr`), `SW` (digital, active-low), `VCC`, `GND`
- supply: `set <role>.x|y = <0–1023>` (default 512 = center); `set <role>.pressed = true|false` (`SW` LOW while pressed)
- unit test: `selftests/parts/velxio-joystick/`
- verified: atmega2560_arduino, esp32s3_espidf, nrf52840_zephyr

### HC-SR04 ultrasonic
- metadataId: `hc-sr04`
- pins: `TRIG` (trigger in — a HIGH pulse ≥ 9 µs starts a measurement on its falling edge; shorter pulses are ignored), `ECHO` (echo out), `VCC`, `GND`
- supply: `set <role>.distance = <cm>` (2–400, default 10; read-back has ±1 cm echo-timing rounding)
- unit test: `selftests/parts/wokwi-hc-sr04/`
- implemented: atmega2560_arduino
- verified: esp32s3_espidf, nrf52840_zephyr

### TMP36 analog temperature
- metadataId: `tmp36`
- pins: `Vout` (analog out — `0.5 V + 0.01 V/°C · T`, linear; wire to an `A<N>` board pin, or an AIN pin `P0.02`–`P0.04` / `P0.28`–`P0.31` on `nrf52840_zephyr`), `VCC`, `GND`
- supply: `set <role>.temperature = <°C>` (−40…125, default 25)
- unit test: `selftests/parts/velxio-tmp36/`
- verified: atmega2560_arduino, esp32s3_espidf, nrf52840_zephyr

### MPU6050 6-axis IMU (I2C)
- metadataId: `mpu6050`
- pins: `SDA`, `SCL` (I2C — board's `20`/`21`), `VCC`, `GND`, `AD0` (address select: floating/LOW = `0x68`, HIGH = `0x69`), `INT`, `XCL`, `XDA`
- supply: `set <role>.accelX|accelY|accelZ = <g>`, `set <role>.gyroX|gyroY|gyroZ = <°/s>`, `set <role>.temp = <°C>` — values beyond the firmware-configured full scale saturate (default ±2 g / ±250 °/s). Registers store raw counts scaled per `ACCEL_CONFIG`/`GYRO_CONFIG` (at default full scale: accel raw = `g × 16384`, gyro raw = `°/s × 131`; use values that land on whole counts when asserting raw output).
- power-on: asleep (`PWR_MGMT_1 = 0x40`), also after reset; data registers read `0` until firmware clears `SLEEP`
- unit test: `selftests/parts/wokwi-mpu6050/` (default scale), `selftests/parts/wokwi-mpu6050-fullscale/` (±4 g / ±500 °/s), `selftests/parts/velxio-mpu6050-adafruit-lib/` (Adafruit library)
- implemented: atmega2560_arduino, esp32s3_espidf
- verified: esp32s3_arduino, nrf52840_zephyr

### Water level sensor
- metadataId: `water-level-sensor`
- pins: `signal` (analog out — 0 V at 0, `VCC` at 1023, linear; wire to an `A<N>` board pin, or an AIN pin `P0.02`–`P0.04` / `P0.28`–`P0.31` on `nrf52840_zephyr`), `VCC`, `GND`
- supply: `set <role>.level = <0–1023>` (0 = dry, 1023 = fully immersed, default 0)
- unit test: `selftests/parts/velxio-water-level-sensor/`
- verified: atmega2560_arduino, esp32s3_espidf, nrf52840_zephyr

### Shock sensor
- metadataId: `shock-sensor`
- pins: `signal` (digital out — digital board pin), `VCC`, `GND`
- drive: `set <role>.shock = true` — fires one 50 ms HIGH pulse on `signal` (idle LOW)
- observe: none — exposes no state property; grade the firmware's reaction
- unit test: `selftests/parts/velxio-shock-sensor/`
- verified: atmega2560_arduino, esp32s3_espidf, nrf52840_zephyr

### HC-SR501 PIR motion sensor
- metadataId: `pir-motion-sensor`
- pins: `OUT` (digital out — digital board pin), `VCC`, `GND`
- drive: `set <role>.trigger = true` — drives `OUT` HIGH for 3 s, then LOW
- observe: none — exposes no state property; grade the firmware's reaction (such as using `parse` on serial output into a slot)
- unit test: `selftests/parts/wokwi-pir-motion-sensor/`
- implemented: atmega2560_arduino
- verified: esp32s3_espidf, nrf52840_zephyr

### KY-018 photoresistor light sensor
- metadataId: `ky-018-photoresistor`
- pins: `S` (analog out — `VCC` at 0, 0 V at 1023, linear: brighter gives lower voltage; wire to an `A<N>` board pin, or an AIN pin `P0.02`–`P0.04` / `P0.28`–`P0.31` on `nrf52840_zephyr`), `VCC`, `GND`
- supply: `set <role>.lightLevel = <0–1023>` (0 = dark, 1023 = full bright, default 512)
- unit test: `selftests/parts/velxio-ky-018-photoresistor/`
- verified: atmega2560_arduino, esp32s3_espidf, nrf52840_zephyr

### DS18B20 1-Wire temperature
- metadataId: `ds18b20`
- pins: `data` (1-Wire — digital board pin), `GND`, `VCC`
- supply: `set <role>.temperature = <°C>` (−55…125 on 1/16 °C steps, default 25)
- timing: Convert T samples the temperature when issued; the reading lands 600 ms later at 12-bit (halving per bit below), with a 2 ms EEPROM copy.
- unit test: `selftests/parts/velxio-ds18b20/`
- verified: atmega2560_arduino, esp32s3_espidf, nrf52840_zephyr

### BME280 environmental sensor (I2C or SPI)
- metadataId: `bme280`
- pins: `SDA`, `SCL` (I2C — board's `20`/`21`; address `0x76`, or `0x77` via the address property), `VCC`, `GND`, `SCK`, `MISO`, `MOSI`, `CS` (SPI — board's `52`/`50`/`51` plus any digital pin for `CS`; wiring `CS` selects SPI, otherwise I2C)
- supply: `set <role>.temperature = <°C>` (−40…85, default 25); `set <role>.pressure = <hPa>` (300…1100, default 1013.25); `set <role>.humidity = <%RH>` (0…100, default 50)
- timing: When `config.filter` is set, the IIR filter spreads a temperature or pressure step over several measurements (humidity is unfiltered, though its compensation uses the filtered temperature). Values driven before the first measurement read exact.
- unit test: `selftests/parts/velxio-bme280/`, `selftests/parts/velxio-bme280-spi/`
- verified: atmega2560_arduino, esp32s3_arduino, esp32s3_espidf, nrf52840_zephyr

### DS1307 real-time clock
- metadataId: `ds1307`
- pins: `SDA`, `SCL` (I2C — board's `20`/`21`), `5V`, `GND`, `SQW` (leave unwired)
- drive: Firmware sets the clock via I2C register writes (such as RTClib `adjust()`).
- supply: `set <role>.epoch = <unix seconds>` (sets time registers to that instant's UTC wall time, timezone-independent, and sets day of week with Sunday = `1`, keeping the current 12/24-hour mode and clock-halt bit); `set <role>.running = true|false` (clears for `true` or sets for `false` the clock-halt bit, as a firmware seconds write would; clearing restarts the second there)
- power-on: halted at `2000/01/01 00:00:00`, day `1`; counts once `CH` (bit 7 of seconds) is clear; control register and RAM (`0x00` at power-on) retain written values
- unit test: `selftests/parts/wokwi-ds1307/`
- implemented: atmega2560_arduino
- verified: esp32s3_espidf, nrf52840_zephyr

### KY-038 microphone sound sensor
- metadataId: `ky-038-sound-sensor`
- pins: `A0` (analog out — 0 V at `soundLevel` 0, `VCC` at 1023, linear; wire to an `A<N>` board pin, or an AIN pin `P0.02`–`P0.04` / `P0.28`–`P0.31` on `nrf52840_zephyr`), `D0` (digital out — digital board pin; HIGH while `soundLevel > threshold`; on rising HIGH it chatters: LOW at 12 ms, HIGH from 24 ms; falls cleanly), `VCC`, `GND`
- supply: `set <role>.soundLevel = <0–1023>` (default 0); `set <role>.threshold = <0–1023>` (default 512)
- observe: `expect <role>.detected == true|false` (the level `D0` settles to)
- unit test: `selftests/parts/velxio-ky-038-sound-sensor/`
- implemented: atmega2560_arduino, esp32s3_espidf, nrf52840_zephyr

### MQ-2 gas sensor module
- metadataId: `mq2`
- pins: `AO` (analog out — `voltage` at a 5 V supply, ratiometric to `VCC`), `DO` (digital out — LOW while `voltage > threshold`, else HIGH), `VCC` (5 V), `GND`
- wiring: `AO` to `A0` and `DO` to `5` on `atmega*`; `AO` through a 100 kΩ (`AO` side) / 150 kΩ (to `GND`) voltage divider (×0.6) to `4` on `esp32s3_*` or `P0.03` (`AIN1`) on `nrf52840_*`; `DO` through a `level-shifter` channel to `5` on `esp32s3_*` or `P1.10` on `nrf52840_*`; `VCC` to `5V`
- supply: `set <role>.voltage = <0–5>` (`AO` volts, higher = more gas, default 0.5); `set <role>.threshold = <0–5>` (comparator trim pot volts, default 2.5)
- unit test: `selftests/parts/velxio-mq2/`
- implemented: esp32s3_arduino, esp32s3_espidf, nrf52840_arduino, nrf52840_zephyr
- verified: atmega2560_arduino

### SEN0244 analog TDS sensor (DFRobot Gravity)
- metadataId: `sen0244`
- pins: `signal` (analog out, silkscreen `A` — 0–2.3 V absolute, not ratiometric to supply; requires `+` and `−` wired; wire to an ADC pin), `+` (3.3–5.5 V), `−` (`GND`, Unicode minus `U+2212`)
- wiring: `signal` to `A0` on `atmega*`, `9` on `esp32s3_*`, `P0.03` (`AIN1`) on `nrf52840_*`; `+` to `5V` on `atmega*`, `3V3` on `esp32s3_*`, `VDD` on `nrf52840_*`
- supply: `set <role>.tds = <0–1000>` (ppm at 25 °C; signal voltage `V` solves `TDS = (133.42·V³ − 255.86·V² + 857.39·V) · 0.5`; `0` = 0 V, probe out of water; default 0)
- unit test: `selftests/parts/velxio-sen0244/` (5 V), `selftests/parts/velxio-sen0244-3v3/` (3.3 V)
- implemented: esp32s3_arduino, esp32s3_espidf, nrf52840_arduino, nrf52840_zephyr
- verified: atmega2560_arduino

### DHT11 temperature + humidity
- metadataId: `dht11`
- pins: `DATA` (single-wire, bidirectional — digital board pin), `VCC`, `GND`
- supply: `set <role>.temperature = <°C>` (0–50, default 25); `set <role>.humidity = <%RH>` (20–90, default 50)
- unit test: `selftests/parts/velxio-dht11/`
- verified: atmega2560_arduino, esp32s3_espidf, nrf52840_zephyr

### PA1616S GPS module (Ultimate GPS v3, MTK3339)
- metadataId: `pa1616s`
- pins: `TX` (data out — board's `19`/RX1, `8` on `atmega328p_arduino`, `P1.01` / `uart1` RXD on `nrf52840_zephyr`), `RX` (data in — board's `18`/TX1, `7` on `atmega328p_arduino`, `P1.02` / `uart1` TXD), `VIN` (supply), `GND`, `FIX` (fix status out, optional), `PPS` (pulse-per-second out, optional), `3.3V` / `EN` / `VBAT` (unconnected)
- supply: `set <role>.fix = true|false` (default false); `set <role>.latitude = <°>` (−90…90, default 37.7749); `set <role>.longitude = <°>` (−180…180, default −122.4194); `set <role>.satellites = <n>` (0…12, default 8); `set <role>.altitude = <m>` (default 12.5); `set <role>.speed = <knots>` (default 0); `set <role>.course = <°>` (default 0)
- unit test: `selftests/parts/velxio-pa1616s/`, `selftests/parts/velxio-pa1616s-status/` (`PMTK220` / `PMTK314` / `PMTK605` / `PGCMD`, `FIX` and `PPS` pulses)
- verified: atmega2560_arduino, atmega328p_arduino, esp32s3_espidf, nrf52840_zephyr

### VL53L0X time-of-flight distance sensor (I2C)
- metadataId: `vl53l0x`
- pins: `SDA`, `SCL` (I2C — board's `20`/`21`; address `0x29`, or whatever firmware sets via `setAddress`), `VIN`, `GND`, `GPIO` (unused), `XSHUT` (unused)
- supply: `set <role>.distance = <mm>` (30…2500, default 100; beyond 2000 reads out of range)
- unit test: `selftests/parts/velxio-vl53l0x/`, `selftests/parts/velxio-vl53l0x-address/` (moves to the address written to register `0x8A`; `nrf52840_zephyr` only)
- verified: atmega2560_arduino, esp32s3_arduino, esp32s3_espidf, nrf52840_zephyr

### PMSA003I particulate-matter sensor (I2C)
- metadataId: `pmsa003i`
- pins: `SDA`, `SCL` (I2C — board's `20`/`21`), `VIN` (supply), `GND`, `3Vo` / `RST` / `SET` (unconnected)
- supply: `set <role>.pm1_0 = <µg/m³>` (0…1000, default 8); `set <role>.pm2_5 = <µg/m³>` (0…1000, default 12); `set <role>.pm10 = <µg/m³>` (0…1000, default 20) — standard (`CF=1`) fields. Atmospheric fields equal standard ones up to 30 µg/m³, are 2/3 of them from 80 µg/m³, and interpolate linearly in between (rounded).
- unit test: `selftests/parts/velxio-pmsa003i/`
- verified: atmega2560_arduino, esp32s3_arduino, esp32s3_espidf, nrf52840_zephyr

### LTR390 UV + ambient light sensor (I2C)
- metadataId: `ltr390`
- pins: `SDA`, `SCL` (I2C — board's `20`/`21`), `VIN` (supply), `GND`, `INT` (threshold interrupt out, active-low, optional), `3Vo` (unconnected)
- supply: `set <role>.als = <counts>` (0…1048575, default 45000); `set <role>.uvs = <counts>` (0…1048575, default 1200) — counts at power-on gain 3 and 18-bit resolution. A reading scales as `counts × (gain / 3) × (integration time / 100 ms)`, rounded and saturated at the resolution's full scale.
- unit test: `selftests/parts/velxio-ltr390/`, `selftests/parts/velxio-ltr390-int/`, `selftests/parts/velxio-ltr390-int-repeat/`
- verified: atmega2560_arduino, esp32s3_arduino, esp32s3_espidf, nrf52840_zephyr

### SGP40 VOC gas sensor (I2C)
- metadataId: `sgp40`
- pins: `SDA`, `SCL` (I2C — board's `20`/`21`), `VIN` (supply), `GND`, `3.3V` (regulator output, unconnected)
- supply: `set <role>.raw = <ticks>` (0…65535, default 30000)
- unit test: `selftests/parts/velxio-sgp40/`
- verified: atmega2560_arduino, esp32s3_arduino, esp32s3_espidf, nrf52840_zephyr

### MAX30101 + MAX32664 pulse oximeter / heart rate sensor (I2C)
- metadataId: `max32664`
- pins: `SDA`, `SCL` (I2C — board's `20`/`21`), `3V3` (supply), `GND`, `RST` (reset, active-low), `MFIO` (multifunction IO)
- supply: `set <role>.heartRate = <bpm>` (0…511, default 72); `set <role>.oxygen = <%>` (0…100, default 98); `set <role>.confidence = <%>` (0…100, default 95); `set <role>.status = <0…3>` (`0` success, `1` not ready, `2` object detected, `3` finger detected; default 3); `set <role>.rValue = <ratio>` (0…6553, default 12.5); `set <role>.extStatus = <n>` (−128…127, default 0)
- unit test: `selftests/parts/velxio-max32664/`, `selftests/parts/velxio-max32664-reset/`
- verified: atmega2560_arduino, esp32s3_espidf, nrf52840_zephyr

### HMC5883L magnetometer (I2C)
- metadataId: `hmc5883l`
- pins: `SDA`, `SCL` (I2C — board's I2C pins, fixed address `0x1E`), `VCC` (3.3 V supply), `GND`, `DRDY` (active-low 250 µs data-ready pulse, optional)
- supply: `set <role>.magneticX = <gauss>`, `set <role>.magneticY = <gauss>`, `set <role>.magneticZ = <gauss>` (−100…100; defaults 0.3, −0.2, 0.1)
- unit test: `selftests/parts/velxio-hmc5883l/`, `selftests/parts/velxio-hmc5883l-library/`
- implemented: esp32s3_arduino, nrf52840_arduino
- verified: atmega2560_arduino, esp32s3_espidf, nrf52840_zephyr

### MLX90614 infrared thermometer (GY-906, I2C)
- metadataId: `mlx90614`
- pins: `SDA`, `SCL` (I2C — board's I2C pins, fixed address `0x5A`; breakout pull-ups to its own 3.3 V), `VIN` (3–5 V, onboard regulator), `GND`
- wiring: `SDA`/`SCL` to `20`/`21` on `atmega2560_arduino`, `A4`/`A5` on `atmega328p_arduino`, `38`/`39` on `esp32s3_*`, `P0.21`/`P0.27` (`i2c0`) on `nrf52840_*`; `VIN` to `5V` (`VDD` on `nrf52840_*`)
- supply: `set <role>.objectTemperature = <°C>` (−70…380, default 25); `set <role>.ambientTemperature = <°C>` (−40…125, default 25) — read in 0.02 K steps (a whole °C reads +0.01 °C)
- timing: The first result is ready 250 ms after power-on (earlier reads return it); a newly set value appears at the next 93 ms refresh.
- unit test: `selftests/parts/velxio-mlx90614/`
- implemented: esp32s3_arduino, esp32s3_espidf, nrf52840_arduino, nrf52840_zephyr
- verified: atmega2560_arduino

### MAX17048 lithium fuel gauge (I2C)
- metadataId: `max17048`
- pins: `SDA`, `SCL` (I2C — board's I2C pins, fixed address `0x36`), `VIN` (I2C pull-up supply only; chip runs from the cell), `GND`, `INT` (active-low alert output, optional), `QStart` (rising edge quick-starts, optional), `+` / `-` (cell terminals, leave unconnected)
- supply: `set <role>.batteryConnected = true|false` (default false; NACKs while disconnected or below 2.5 V); `set <role>.cellVoltage = <V>` and `set <role>.openCircuitVoltage = <V>` (0…4.5, defaults 3.8); `set <role>.stateOfCharge = <%>` (0…100, default 50); `set <role>.chargeRate = <%/h>` (−6815.744…6815.536, default 0; `stateOfCharge` integrates it over simulated time)
- unit test: `selftests/parts/velxio-max17048/`, `selftests/parts/velxio-max17048-library/`, `selftests/parts/velxio-max17048-hibernate/`, `selftests/parts/velxio-max17048-power/`
- verified: atmega2560_arduino, esp32s3_espidf, nrf52840_zephyr

### AMG8833 8×8 thermal array (I2C)
- metadataId: `amg8833`
- pins: `SDA`, `SCL` (I2C — board's I2C pins; address property `0x69`, or `0x68` with the rear jumper closed), `VIN` (supply), `GND`, `INT` (active-low interrupt out, optional), `3Vo` (unconnected)
- supply: `set <role>.pixel0` … `.pixel63 = <°C>` (−512…511.75, 0.25 °C resolution; UI −20…80; default 25); `set <role>.thermistorTemperature = <°C>` (−20…80, 0.0625 °C resolution, default 25); `set <role>.pixelAdcOverflow = true|false` (ADC fault stimulus, default false)
- unit test: `selftests/parts/velxio-amg8833/`, `selftests/parts/velxio-amg8833-library/`, `selftests/parts/velxio-amg8833-address-library/`
- implemented: esp32s3_arduino, nrf52840_arduino
- verified: atmega2560_arduino, esp32s3_espidf, nrf52840_zephyr

### MPR121 capacitive touch controller (I2C)
- metadataId: `mpr121`
- pins: `SDA`, `SCL` (I2C — board's I2C pins), `VIN` (3–5 V), `GND`, `3Vo` (regulated 3.3 V), `INT` (active-low interrupt), `ADDR` (`GND`/default `0x5A`, `3Vo` `0x5B`, `SDA` `0x5C`, `SCL` `0x5D`), `0`–`11` (electrodes; `4`–`11` also GPIO/LED outputs)
- drive: `do <role>.0.down` … `.11.down`, `.0.up` … `.11.up`
- supply: `set <role>.capacitance0` … `.capacitance11 = <pF>` (positive, ≤ 100000, default 15; UI contact adds 10 pF); `set <role>.rextOvercurrent = true|false` (default false)
- unit test: `selftests/parts/velxio-mpr121/`, `selftests/parts/velxio-mpr121-library/`, `selftests/parts/velxio-mpr121-address-3vo/`, `selftests/parts/velxio-mpr121-address-sda/`, `selftests/parts/velxio-mpr121-address-scl/`, `selftests/parts/velxio-mpr121-gpio/`, `selftests/parts/velxio-mpr121-autocal/`, `selftests/parts/velxio-mpr121-unpowered/`
- implemented: esp32s3_arduino, nrf52840_arduino
- verified: atmega2560_arduino, esp32s3_espidf, nrf52840_zephyr

### L298N dual H-bridge module
- metadataId: `l298n`
- pins: `ENA`, `IN1`, `IN2` (bridge A), `IN3`, `IN4`, `ENB` (bridge B), `OUT1` / `OUT2` (A outputs), `OUT3` / `OUT4` (B outputs), `+12V` (5–35 V motor supply), `GND` (common ground), `+5V` (logic supply input or regulator output)
- wiring: Wire `battery-9v` (`+` / `−`) or DC `power-supply` (`SIG` / `GND`). `regulatorJumper` requires 6–12 V; otherwise supply external 4.5–7 V logic on `+5V`. Remove `enaJumper` / `enbJumper` for MCU enable control (installed by default).
- drive: `set <role>.enaJumper|enbJumper|regulatorJumper = true|false`
- observe: `stateA|stateB` (`positive`, `negative`, `brakeHigh`, `brakeLow`, or `coast`); `positiveA`, `negativeA`, `brakeHighA`, `brakeLowA`, `coastA` (and `B` equivalents) give the fraction of time in that state over the last `sampleWindowMs` (default 100); `driveA|driveB` is `positive − negative`
- unit test: `selftests/parts/velxio-l298n/`, `selftests/parts/velxio-l298n-pwm/`, `selftests/parts/velxio-l298n-external-logic/`, `selftests/parts/velxio-l298n-jumpers/`
- implemented: esp32s3_arduino, nrf52840_arduino
- verified: atmega2560_arduino, esp32s3_espidf, nrf52840_zephyr

### Three-channel infrared line sensor
- metadataId: `line-sensor`
- pins: `VCC` (3.0–5.1 V), `GND`, `L` / `M` / `R` (active source/sink outputs; HIGH for weak reflected IR, LOW for strong reflection)
- wiring (supply): Wire `VCC` (3.0–5.1 V) to a 3.3 V or 5 V board rail, and `GND` directly to common ground.
- wiring (3.3 V boards): At 3.3 V, HIGH is about 2.15 V (`VCC − 1.15 V`), too low for ESP32-S3 and nRF52840 inputs; wire `VCC` and `level-shifter` `HV` to `5V`, `LV` to the MCU's 3.3 V rail, and each output to a `level-shifter` `HVn` with `LVn` to an MCU input (~4.6 V at `HVn`, 3.3 V at `LVn`).
- wiring (direct output): HIGH is about `VCC − 1.15 V` (load-dependent); wire directly to a 5 V MCU input.
- drive: `set <role>.leftPhotocurrentUa|middlePhotocurrentUa|rightPhotocurrentUa = <0–400>` (µA, defaults 200); `set <role>.thresholdPosition = <0.2–0.6>` (shared pot, default 0.5; 1–3 V reference at 5 V)
- observe: `leftVoltage|middleVoltage|rightVoltage|supplyVoltage` (V), `supplyCurrent` (A)
- unit test: `selftests/parts/velxio-line-sensor/`, `selftests/parts/velxio-line-sensor-loaded/`, `selftests/parts/velxio-line-sensor-supply/`
- implemented: esp32s3_espidf, esp32s3_arduino, nrf52840_zephyr, nrf52840_arduino
- verified: atmega2560_arduino

### 9 V battery source
- metadataId: `battery-9v`
- pins: `+` (positive), `−` (negative, Unicode minus)
- supply: Fixed 9 V source with 1.5 Ω series resistance; wire `−` to common ground.
- unit test: `selftests/parts/velxio-l298n/`
- implemented: atmega2560_arduino, esp32s3_espidf, esp32s3_arduino, nrf52840_zephyr, nrf52840_arduino

### DC power supply
- metadataId: `power-supply`
- pins: `SIG` (positive), `GND` (negative)
- supply: `mode: 'dc'`, `voltage` (V), `currentLimit` (A, positive); series resistance is `max(0.01, voltage / (1.5 × max(0.01, currentLimit)))`; wire `GND` to common ground.
- unit test: `selftests/parts/velxio-l298n-external-logic/`
- implemented: atmega2560_arduino, esp32s3_espidf, nrf52840_zephyr

### 4-channel BSS138 logic level shifter
- metadataId: `level-shifter`
- pins: `HV1`–`HV4` / `LV1`–`LV4` (channel high / low sides), `HV` (high supply), `LV` (low supply), `GND.1` (top row), `GND.2` (bottom row)
- wiring: Wire `HV` to `5V`, `LV` to the 3.3 V rail (`3V3.1` on `esp32s3_*`, `VDD` on `nrf52840_*`, `3.3V` on `atmega2560_arduino`, whose MCU is on `HV`), and `GND` to common ground. Each channel is a bidirectional open-drain BSS138 with 10 kΩ pull-ups to `HV` and `LV`.
- unit test: `selftests/parts/velxio-level-shifter/`
- implemented: atmega2560_arduino
- verified: esp32s3_espidf, esp32s3_arduino, nrf52840_zephyr, nrf52840_arduino

## Network

### WiFi network
- metadataId: `wifi`
- pins: none — no wires; its `test.jsonl` circuit row has no `pin`
- supply: Enables the board's WiFi; APs and services are documented in `targets.md`.
- unit test: `selftests/wifi/join/`, `selftests/wifi/scan/`
- implemented: esp32s3_espidf
- verified: esp32s3_arduino

### Bluetooth LE
- metadataId: `ble`
- pins: none — no wires; its `test.jsonl` circuit row has no `pin`
- supply: Enables the board's BLE; the phone and its peer are documented in `targets.md`.
- unit test: `selftests/ble/<case>/`
- implemented: nrf52840_zephyr

### HM-10 BLE module (HMSoft V545)
- metadataId: `hm10`
- pins: `VCC` (5 V header; 3.3 V rail on ESP32-S3 and nRF52840), `GND`, `TXD` (UART out — board's UART RX: `19`/RX1 on Mega, `8` on Uno), `RXD` (3.3 V UART in — `18`/TX1 on Mega through a `level-shifter` channel, `7` on Uno through 1 kΩ with 2 kΩ from `RXD` to `GND`; direct on 3.3 V boards), `UART_TX` / `UART_RX` (pads, same nets as `TXD` / `RXD`), `UART_CTS` / `UART_RTS` (active-low flow control with `AT+FIOW1`), `RESETB` (reset), `VCC12` (3.3 V; leave unwired), `GND13` / `GND14` / `GND21` / `GND22`, `PIO0` (key), `PIO1` (status LED), `PIO2`–`PIO11` (GPIO/ADC) — raw pads take at most 3.6 V and 1 mA, so route any Mega-driven pad through a `level-shifter` channel
- supply: `startupConfiguration` (saved settings as JSON, e.g. `{"role":1,"immediate":1}`); phone fields: `remoteAddress`, `remotePin`, `remoteAuthenticated`, `remoteBonding`, `remoteIntervalMs`, `remoteAncs`, and the `ancs*` notification fields
- drive: `do <role>.remoteOn|remoteOff|connect|subscribe|disconnect|readRemote|ancsNotify|resetDown|resetUp|keyDown|keyUp`; `send <role>.remote` (phone Write Without Response)
- observe: `connected`, `sleeping`, `remoteRxHex` (bytes received by the phone), `remoteReadHex`, `uartRxHex` (bytes received by the module on `RXD`). Module replies are bare ASCII without CR/LF; commands ending in CR/LF get no reply.
- timing: A disconnected command ends after 5 ms without UART RX activity.
- unit test: `selftests/parts/hm10_at/`, `hm10_settings/`, `hm10_central/`, `hm10_ancs/`, `hm10_flow/`, `hm10_bit7/`, `hm10_pio/`, `hm10_binary/`, `hm10_parity/`, `hm10_ready/`, `hm10_ready_crlf/`, `hm10_led/`
- implemented: esp32s3_arduino, nrf52840_arduino
- verified: atmega2560_arduino, atmega328p_arduino, esp32s3_espidf, nrf52840_zephyr
