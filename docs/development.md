# Development & Maintainer Guide

This guide covers building EmbedGym's Docker images and emulators from source, configuring local `arduino-cli` toolchains for `run.sh`, understanding the simulator architecture, integrating new peripheral models, and running internal test suites.

---

## Building from Source

### Docker Images & Emulators (`qemu-esp32s3`, `renode`)

Prebuilt images are pulled from GHCR as shown in [README.md](../README.md). To build all container images and custom emulator binaries from source, check out the pinned emulator commits from [`docker/emulators.env`](../docker/emulators.env) and bake with [`docker/docker-bake.hcl`](../docker/docker-bake.hcl) (mirroring [`.github/workflows/docker-images.yml`](../.github/workflows/docker-images.yml); set `ARCH` to `amd64` or `arm64`):

```bash
set -a && . docker/emulators.env && set +a
git clone https://github.com/functions-lab/qemu-esp32.git third-party/qemu-esp32s3
git -C third-party/qemu-esp32s3 checkout "$QEMU_COMMIT"
git clone https://github.com/functions-lab/renode.git velxio/third-party/renode
git -C velxio/third-party/renode checkout "$RENODE_COMMIT"
git -C velxio/third-party/renode submodule update --init --recursive
git clone https://github.com/renode/renode-resources.git velxio/third-party/renode/lib/resources
git -C velxio/third-party/renode/lib/resources checkout "$RENODE_RESOURCES_COMMIT"

export ARCH=amd64
docker buildx bake -f docker/docker-bake.hcl qemu   # writes prebuilt/qemu/libqemu-xtensa.so
cp third-party/qemu-esp32s3/pc-bios/{esp32s3_rev0_rom.bin,esp32-v3-rom.bin,esp32-v3-rom-app.bin,esp32c3-rom.bin} prebuilt/qemu/
docker buildx bake -f docker/docker-bake.hcl --load \
  --set 'env-arduino.tags=embedgym-env-arduino' \
  --set 'env-espidf.tags=embedgym-env-espidf' \
  --set 'env-zephyr.tags=embedgym-env-zephyr' \
  --set 'sim.tags=embedgym-sim' \
  --set 'esp-cloud.tags=embedgym-esp-cloud' \
  env sim esp-cloud
```

> **Note:** After rebuilding `libqemu-xtensa.so`, confirm its ctypes callback order and GPIO-matrix layout match `velxio/backend/app/services/esp32_worker.py` by running the ESP32-S3 backend probes.

### Host `arduino-cli` Setup (for compiling Arduino reference firmware with `run.sh`)

Agent evaluation (`run_agent.py`) and prebuilt grading (`grade.py`, `run.sh --firmware`) compile inside containers and do **not** need a host `arduino-cli`. If you compile Arduino reference firmware (`tasks/` or `selftests/`) locally via `run.sh`, install the AVR, ESP32-S3, and nRF52840 Arduino cores once:

```bash
arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index
arduino-cli core install arduino:avr esp32:esp32@2.0.17

# Install EmbedGym's app_start hook and merged-bin build hook for esp32s3_arduino
CORE="$(arduino-cli config get directories.data)/packages/esp32/hardware/esp32/2.0.17"
cp docker/env_image/esp32s3_arduino/embedgym_appstart.c "$CORE/cores/esp32/"
cp docker/env_image/esp32s3_arduino/platform.local.txt "$CORE/"

# Copy the prebuilt nrf52840_arduino Zephyr core from embedgym-env-arduino
arduino-cli core install arduino:zephyr_main@1.0.0
HW="$(arduino-cli config get directories.user)/hardware/embedgym"
rm -rf "$HW/zephyr" && mkdir -p "$HW"
docker create --name embedgym-zephyr-core embedgym-env-arduino
docker cp embedgym-zephyr-core:/root/Arduino/hardware/embedgym/zephyr "$HW/zephyr"
docker rm embedgym-zephyr-core
```

Re-copy the corresponding files if you edit `docker/env_image/esp32s3_arduino/` or rebuild `embedgym-env-arduino`. Install any third-party library required by a reference sketch via `arduino-cli lib install`.

### Running the Backend Outside Docker

To run the Velxio Python backend directly on the host with `pyrenode3`:

```bash
export PYTHONPATH="$PWD/parts"
export EMBEDGYM_RENODE_ROOT="$PWD/velxio/third-party/renode"
export DOTNET_ROOT=/path/to/dotnet9
export VELXIO_BUILD_ROOT=/tmp/velxio-builds
cd velxio/backend && uvicorn app.main:app --port 8001
```

For BLE tasks, the environment also needs `bumble==0.0.235`, `EMBEDGYM_BLE_CONTROLLER_ELF` (built from [`docker/sim_image/ble_controller/`](../docker/sim_image/ble_controller/)), `EMBEDGYM_ROOT`, and `EMBEDGYM_CLOUD_TOKEN`.

---

## Simulator Architecture

EmbedGym separates **CPU emulation** from **peripheral behavior**, **analog circuit solving**, and **network peers**:

```text
  ┌──────────────────────────┐        Unified Interface        ┌────────────────────────────┐
  │  MCU Emulators           │   GPIO / ADC / PWM / I2C / SPI  │  Frontend Parts (TS)       │
  │  - avr8js (browser)      │ ◄─────────────────────────────► │    parts/sim/*.ts          │
  │  - QEMU (esp32_worker)   │                                 │  Shared Python Models      │
  │  - Renode (nrf52_worker) │ ◄────── Pin Voltages ─────────► │    parts/embedgym_parts/   │
  └──────────────────────────┘         (ngspice SPICE)         │  Virtual WiFi / BLE Peers  │
                                                               └────────────────────────────┘
```

- **AVR (`atmega2560_arduino`, `atmega328p_arduino`)**: Runs `avr8js` directly in Chromium. Python peripheral models execute in-browser via Pyodide (`velxio/frontend/src/simulation/python/PythonModels.ts`), together with WebAssembly `ngspice`.
- **ESP32-S3 (`esp32s3_espidf`, `esp32s3_arduino`)**: Runs a custom QEMU fork (`libqemu-xtensa.so`) in `velxio/backend/app/services/esp32_worker.py`, bridged to the frontend via `Esp32BridgeShim`.
- **nRF52840 (`nrf52840_zephyr`, `nrf52840_arduino`)**: Runs Renode in `velxio/backend/app/services/nrf52_worker.py` over the same bridge protocol, paired with virtual BLE host/controller workers (`nrf52_ble.py`, `embedgym_ble/`).
- **Container live-mount behavior**: `sim.sh` mounts `parts/`, `tasks/`, `harness/`, and `velxio/backend/app/` read-only. Backend worker scripts (`nrf52_worker.py`, `esp32_worker.py`, `parts/embedgym_parts/`) reload per simulation run; edits to other `velxio/backend/app/` files require `docker restart embedgym-sim`.

### Core Modeling Rules

1. **No substitute parts**: Model each peripheral as the exact part named by the task.
2. **Reject unsupported operations explicitly**: Never silently ACK invalid commands, register addresses, or timings. Raise `ValueError` in Python models, throw a plain `Error` in frontend parts, or call `picsimlab_reject` in QEMU models—each surfaces as `simulated hardware rejected the firmware's operation: ...` during simulation.
3. **Virtual clock only**: Schedule every pin edge, conversion delay, and polling timer on the simulated CPU clock (`host.timer`, `drivePinAfter`, `schedulePinChange`), never on host wall-clock timers.

---

## Adding a New Peripheral Model

Part contracts live in [components.md](components.md), per-target pins and limits in [targets.md](targets.md), rejection semantics in [Core Modeling Rules](#core-modeling-rules), and the synthesis/doc steps in [workflow/pipeline.md](../workflow/pipeline.md) (C2–C5).

### Where Behavior Lives

| Kind | Model | Reference |
|---|---|---|
| Digital level | Frontend part, `setPinState` | `ky-020-tilt-switch` ([`Ky020TiltSwitch.ts`](../parts/sim/Ky020TiltSwitch.ts)) |
| Timed edges, no model | Frontend part, `drivePinAfter` | `bounce-button` ([`BounceButton.ts`](../parts/sim/BounceButton.ts)) |
| Analog on an ADC pin | Frontend part, `setAdcVoltage` | `tmp36` ([`Tmp36.ts`](../parts/sim/Tmp36.ts)) |
| Analog, fraction of supply | `RATIOMETRIC_SENSORS` | `water-level-sensor` ([`WaterLevelSensor.ts`](../parts/sim/WaterLevelSensor.ts)) |
| Drives own pins as resistive sources | Frontend part, physical pin drives | `line-sensor` ([`LineSensor.ts`](../parts/sim/LineSensor.ts)), [`L298n.ts`](../parts/sim/L298n.ts) |
| Pin-timed | Python model | `hc-sr04`, `pir-motion-sensor` |
| Single-wire line | Python model, `LINE_PARTS` | `ds18b20` |
| I2C | Python model, `I2C_PARTS` | `ltr390` |
| SPI | Python model, `SPI_PARTS` | `bme280` |
| UART | Python model | `pa1616s`, `hm10` |

Frontend parts live in `parts/sim/<Name>.ts`. Python models live in `parts/embedgym_parts/<part>.py` (I2C under [`parts/embedgym_parts/i2c/`](../parts/embedgym_parts/i2c/)), use one unified implementation across all targets, and import only the Python stdlib and `embedgym_parts`.

### Element Registration

- Add the flat top-down SVG at `parts/elements/svgs/<part>.svg` and Web Component (`pinInfo`) in `parts/elements/<Name>Element.ts`, exported from [`parts/elements/index.ts`](../parts/elements/index.ts) (imported by velxio's `velxio/frontend/src/components/velxio-components/registerAll.ts` as `@parts/elements`; [`parts/vite-plugin.ts`](../parts/vite-plugin.ts) configures `@parts` and serves `/component-svgs/<part>.svg`).
- Add metadata to [`parts/components.json`](../parts/components.json) and regenerate `velxio/frontend/public/components-metadata.json` (`cd velxio/frontend && NODE_PATH=$PWD/node_modules npm run generate:metadata`; requires `git -C velxio submodule update --init third-party/wokwi-elements`).
- `ownsPointer` in `handleMouseDown` (`velxio/frontend/src/components/DynamicComponent.tsx`): while a simulation runs, pointer-down goes to the canvas unless the element's tag is listed there (`velxio-bounce-button`, `velxio-mpr121`, wokwi buttons/keypads/encoders). Harness `do` verbs invoke element methods via `invokeDoVerb` ([`harness/do_verbs.ts`](../harness/do_verbs.ts)) directly.

### Frontend Part

- `parts/sim/<Name>.ts` calls `PartSimulationRegistry.register(metadataId, { attachEvents })` (`velxio/frontend/src/simulation/parts/PartSimulationRegistry.ts`) and is imported in [`parts/sim/index.ts`](../parts/sim/index.ts) (loaded after velxio's own part files, so matching `metadataId` registrations replace built-ins).
- `attachEvents(element, simulator, getPin, componentId)` returns a cleanup function. `getPin(partPin)` traces through wires, passive parts, and `level-shifter` channels to a board pin number: `-1` for a rail pin, a synthetic pin ID for an off-board custom chip net, or `null`. `DynamicComponent` reruns cleanup and re-attaches when the simulator, program, or wiring changes.
- `simulator` is `AVRSimulator` on AVR targets or the per-part view (`forPart`) of `Esp32BridgeShim` (`velxio/frontend/src/store/useSimulatorStore.ts`) on ESP32-S3 and nRF52840.
- Inputs (`set` rows and UI controls): call `registerSensorUpdate(componentId, handler)` in `attachEvents` and `unregisterSensorUpdate(componentId)` in cleanup (`velxio/frontend/src/simulation/SensorUpdateRegistry.ts`). `handler` receives only the changed keys and throws a plain `Error` on invalid keys or values (a `set` row on a part without a handler fails the run). UI sensor-panel sliders/controls go in [`parts/sim/sensorControls.ts`](../parts/sim/sensorControls.ts) (`LOCAL_SENSOR_CONTROLS`).
- Properties read by the electrical solver are pushed with `emitPropertyChange(componentId, prop, value)` (`velxio/frontend/src/simulation/parts/partUtils.ts`).

### Electrical Solve (SPICE & Physical Pin Drives)

- `componentToSpice` maps components via `MAPPERS[metadataId]` (`velxio/frontend/src/simulation/spice/componentToSpice.ts`). A mapper returns `{ cards, modelsUsed, pins }`, where any wired pin omitted from `pins` remains part-driven rather than SPICE-sourced. Equivalent electrical models reuse an existing mapper (`MAPPERS['bounce-button'] = MAPPERS['pushbutton']`).
- **Ratiometric outputs**: An entry `[{ pin, prop, idle, fullScale, slope }]` in `RATIOMETRIC_SENSORS` (`velxio/frontend/src/simulation/spice/ratiometricSensors.ts`) generates `ratiometricSensorToSpice` (a 10 kΩ divider between `VCC` and `GND` at `properties[prop] / fullScale` for `'rising'` or `1 - ratio` for `'falling'`, initialized to `idle`; emits nothing if `VCC` or `GND` is unwired). Frontend parts push values with `emitPropertyChange` and initialize from `idleValue(metadataId, prop)`.
- **Physical pin drives**: Parts driving their own pins call `setPhysicalPinDrive(componentId, partPin, owner, { voltage, resistance } | null)` (`velxio/frontend/src/simulation/PhysicalPinDrives.ts`), then `requestElectricalResolve()` (`velxio/frontend/src/simulation/spice/electricalResolveHook.ts`) when `setPhysicalPinDrive` returns `true`, and `clearPhysicalPinDrives(componentId)` in cleanup. Its SPICE mapper uses `physicalDriveCards` (emits sources only when `GND` is wired). Drives on pins wired to MCU inputs also go to `setExternalPinDrive(gpio, owner, drive)` / `removeExternalPinDrive(gpio, owner)` (`AVRSimulator`; `BridgePinDrives` via the shim). Wiring helpers: `physicalPinConnections`, `railDrive` ([`parts/sim/physicalPinConnections.ts`](../parts/sim/physicalPinConnections.ts)).
- **Model-driven MCU inputs**: Register `MODEL_DRIVEN_INPUTS[type]` (`velxio/frontend/src/simulation/modelDrivenInputs.ts`, e.g., `'hc-sr04': (_, p) => [p.echo_pin]`) so `AVRSimulator.registerSensor` and `Esp32BridgeShim.registerSensor` exclude those GPIOs (plus `sda_pin`/`scl_pin` for I2C) from `connectDigitalInputsToMcu` (`velxio/frontend/src/simulation/spice/connectDigitalInputsToMcu.ts`), preventing SPICE from overwriting model-driven or externally driven MCU pins.

### Python Models (`Part` & `Host`)

`Part` ([`parts/embedgym_parts/registry.py`](../parts/embedgym_parts/registry.py)) validates attach fields, constructs the model, and wires callbacks to `Host` (same file): `update(values)` rejects unknown keys and updates properties; `detach()` stops timers/watches and detaches buses; invalid values or unsupported operations raise `ValueError`. Any primitive added to `Host` must be implemented in all three hosts:

| Target | Host Implementation |
|---|---|
| ESP32-S3 | `_LocalHost` in `velxio/backend/app/services/esp32_worker.py` |
| nRF52840 | `LocalHost` in `velxio/backend/app/services/nrf52_worker.py` |
| AVR | `attachLocalPart` in `velxio/frontend/src/simulation/python/PythonModels.ts` (Pyodide on `AVRSimulator`) |

`TYPES` in `registry.py` contains the keys of `I2C_PARTS`, `LINE_PARTS`, `PULSE_PARTS`, plus `hc-sr04`, `membrane-keypad`, `pa1616s`, `hm10`, and `ky-040`. `SPI_PARTS` is not included in `TYPES` automatically—a type appearing only in `SPI_PARTS` must be added to `TYPES` explicitly. Both backend workers dispatch only types listed in `TYPES` to `Part`.

#### Frontend attachment pattern for Python models
1. Resolve pins with `getPin` and validate initial values (throwing plain `Error`).
2. Call `sim.registerSensor(type, pin, fields)`. Unless it returns `true` (`AVRSimulator` returns `false` if absent from `AVR_LOCAL_PARTS` or before CPU/Pyodide init; `Esp32BridgeShim` returns `true`), return a no-op cleanup.
3. Call `registerSensorUpdate(componentId, (values) => { /* validate */ sim.updateSensor(pin, values); })`.
4. Return cleanup calling `sim.unregisterSensor(pin)` and `unregisterSensorUpdate(componentId)`.

`pin` is the part's primary GPIO (`DATA`, `TRIG`, `OUT`, `TX`), CS GPIO for SPI, `200 + addr` for I2C, or `300` for `hm10`. Additional GPIOs pass in `fields` as `<name>_pin` (`echo_pin`, `int_pin`, `rx_pin`, or `pads` for `hm10`). Element visual state reported via `on_state` → `host.report` (`part_state` event) is received through `getBridge().onPartState(pin, apply)` on backend targets and `sim.onPartState(pin, apply)` on AVR ([`Drv2605l.ts`](../parts/sim/Drv2605l.ts)).

#### Model categories & hooks
- **Pin-timed**:
  - Fixed-hold pulses use `PULSE_PARTS[type] = (property, hold_ns)` (`PulseSensor`, [`pulse_sensor.py`](../parts/embedgym_parts/pulse_sensor.py); no extra attach fields; e.g., `pir-motion-sensor`, `shock-sensor`, [`PulseSensor.ts`](../parts/sim/PulseSensor.ts)).
  - General pin-timed parts add a branch in `Part.__init__` and `TYPES`, using `host.output(gpio, high)` (`drive(high, at_ns)`), `host.edges(on_edge)`, `host.watch(gpios, changed)`, `host.mcu_pin(gpio)`, `host.set_level(gpio, high)`, and `host.timer(tick)` (e.g., [`hc_sr04.py`](../parts/embedgym_parts/hc_sr04.py), [`HcSr04.ts`](../parts/sim/HcSr04.ts), `ky-040`, `membrane-keypad`).
- **Single-wire line**:
  - `LINE_PARTS[type] = ({ property: (low, high) }, make(read, drive, timing))`. Attach fields must match the range keys (out-of-range values raise). Models read inputs via `read(key)`, drive lines via `drive(low, at_ns)`, and receive bus transitions via `on_line(high, t_ns)`.
  - `timing` comes from `host.line_timing(type)`: `{}` on ESP32-S3 and AVR; `LINE_TIMING[type]` in `nrf52_worker.py` on nRF52840 (`{}` keeps datasheet timing). Reference: [`ds18b20.py`](../parts/embedgym_parts/ds18b20.py), [`Ds18b20.ts`](../parts/sim/Ds18b20.ts).
- **I2C**:
  - Models implement `handle_event(event)` per [`parts/embedgym_parts/i2c/protocol.py`](../parts/embedgym_parts/i2c/protocol.py) (`0` ACKs, nonzero NACKs, read returns byte).
  - Register `I2C_PARTS[type] = (factory(addr, now_ns), { frontendProp: updateKeyword }, updateStyle)` using `_fixed(name, addresses, make)` when addresses are constrained. Update styles: `_kwargs` (`model.update(**{kw: float(val)})` over full state), `_raw` (`model.update(changed)`), `_gauge` / `_at_drive` (`model.update(changed, host.drive_ns())`), `_rtc` (`ds1307`).
  - `addr`, `PIN_FIELDS`, and `CIRCUIT_FIELDS` are stripped before initial property updates. `_attach_i2c` wires optional hooks when defined on the model:
    - `on_address_change(old, new)`: moves the device address on the bus.
    - `SCHEDULE_HOOKS` (`on_conversion_scheduled`, `on_measurement_scheduled`, `on_playback_scheduled`): arms a host timer calling `model.tick(now_ns)`.
    - `attach_circuit(fields)`: invoked once with attach fields.
    - `pins_changed`: connects `host.connect_part_pins` (including INT); otherwise an `int_pin` field requires `on_interrupt_change(asserted)` (active-low interrupt, idling HIGH).
    - `on_state` (`host.report`), `set_time_origin` (`host.on_start`), `power_on()`, `set_reset_pin` (`rst_pin` + optional `mfio_pin`), and `set_bus_pins` (`qstart_pin`).
  - Frontend attaches at virtual pin `200 + addr` (e.g., [`ltr390.py`](../parts/embedgym_parts/i2c/ltr390.py), [`Ltr390.ts`](../parts/sim/Ltr390.ts), `pmsa003i`, `ds1307`).
- **Model pins on circuit nets**:
  - Models driving/sensing circuit nets define `pins_changed`. `host.connect_part_pins(model, fields)` binds `on_pin_drive(part_pin, drive)` and `pin_voltage(part_pin)` (`drive` is `{ voltage, resistance }` or `None` for Hi-Z).
  - ESP32-S3/nRF52840 resolve MCU-wired pins via `McuPins` ([`mcu_pins.py`](../parts/embedgym_parts/mcu_pins.py)) and forward canvas pin drives as `part_pin_drive` events (`pin_drive_emitter`, [`pin_drive.py`](../parts/embedgym_parts/pin_drive.py)) applied by `getBridge().drivePartPins(pin, componentId)` with owner `'worker'`. AVR passes `LocalPartPins` (`drive`, `voltage`, `watch`) as the fourth argument of `registerSensor`. Reference: [`mpr121.py`](../parts/embedgym_parts/i2c/mpr121.py), [`Mpr121.ts`](../parts/sim/Mpr121.ts).
- **UART**:
  - Branch in `Part.__init__` + `TYPES`, calling `host.uart(tx_gpio, rx_gpio, on_byte)` returning `Uart` (`receiver()`, `deliver(byte)`, `stop()`), where `on_byte(byte, framing)` receives bytes from MCU TX ([`uart.py`](../parts/embedgym_parts/uart.py)).
  - If `host.uart` returns `None` (`atmega328p_arduino`), run `PinUart` ([`pin_uart.py`](../parts/embedgym_parts/pin_uart.py)). Hardware UART bindings match [targets.md](targets.md). References: [`pa1616s.py`](../parts/embedgym_parts/pa1616s.py), [`Pa1616s.ts`](../parts/sim/Pa1616s.ts), [`hm10.py`](../parts/embedgym_parts/hm10.py) (`_attach_hm10`), [`Hm10.ts`](../parts/sim/Hm10.ts).
- **SPI**:
  - Register `SPI_PARTS[type] = (make(now_ns), { frontendProp: updateKeyword }, updateStyle)`. The model implements `spi_transfer(mosi) -> miso` and `spi_deselect()`, selected via attach field `transport: 'spi'` (frontend registers on the CS GPIO, e.g., [`Bme280.ts`](../parts/sim/Bme280.ts)). Hosts handle CS edges via `_spi_slaves_by_cs` (ESP32-S3), `SpiPart` (nRF52840; MISO reads `0` unselected and raises if two parts are selected), and `addSpiDevice` (AVR).

### Per-Host Integration Tables

#### AVR Host (`AVRSimulator` & `PythonModels.ts`)

- Add `metadataId` to `AVR_LOCAL_PARTS` in `velxio/frontend/src/simulation/python/PythonModels.ts` (otherwise `AVRSimulator.registerSensor` returns `false`, and [`harness/jsonl_runner.ts`](../harness/jsonl_runner.ts) skips Pyodide initialization).
- Signature: `registerSensor(type, pin, fields, partPins?, restartProps?)`, where `restartProps()` supplies the re-attach properties across AVR resets.
- `callPython` converts model `ValueError` into plain frontend `Error`; `line` models require `onLineChange`; `on_start` runs at attach (reset time origin); model virtual time is `floor(cycles * 62.5)` ns with events scheduled at cycle `ceil(t / 62.5)`.

#### ESP32-S3 & nRF52840 Frontend Shim (`Esp32BridgeShim`)

Configured in `velxio/frontend/src/store/useSimulatorStore.ts`:
- `REQUIRED_SENSOR_PROPS`: required wire fields checked before `registerSensor` (throws naming the missing wire, e.g. `ky-040`: `dt_pin`; `hc-sr04`: `echo_pin`; `max32664`: `rst_pin`, `mfio_pin`).
- `I2C_SENSOR_TYPES`: unless `transport: 'spi'`, attaches resolved `sda_pin` and `scl_pin` (both must resolve and differ).

#### ESP32-S3 Worker (`esp32_worker.py`)

In `velxio/backend/app/services/esp32_worker.py`, `sensor_gpios(type, pin, fields)` and `GpioOwners` enforce exclusive GPIO ownership (matching failure or unknown `sensor_type` fails the worker):

| Part Kind | Worker Registry Table | `pin` Claimed |
|---|---|---|
| Pin-timed, pulse, line | `GPIO_SENSOR_TYPES` | Part's primary GPIO |
| I2C | `I2C_SENSOR_TYPES` (here and in shim) | None (`pin` is `200 + addr`) |
| UART | `UART_SENSOR_TYPES` | TX GPIO |
| SPI | `transport == 'spi'` branch ahead of `I2C_SENSOR_TYPES` | CS GPIO |
| Custom multi-pin | Per-part branch (e.g., `hm10`: `tx_pin`, `rx_pin`, pad GPIOs) | Custom |

- `EXTRA_PIN_KEYS[type]` adds secondary GPIOs driven or read by the model to ownership claims. `_LocalHost.i2c_attach` requires `sda_pin` and `scl_pin`; `_LocalHost.line_timing` is `{}`; `on_start` runs at app start; `ValueError` in timer/watch/line/UART/start callbacks surfaces as `_local_rejected`.
- Physical pin drives on MCU inputs use `BridgePinDrives` (drives between `VIL`/`VIH` or `> 3.6 V` fail the run); timed frontend-only edge parts (`bounce-button`, `ky-038-sound-sensor` `D0`) use `sendPinEventAfter` in grading mode.

#### nRF52840 Worker (`nrf52_worker.py`)

In `velxio/backend/app/services/nrf52_worker.py`:
- `sensor_attach` raises for types outside `TYPES`. Beyond `TYPES`, only single-wire line parts with Renode-adjusted timings require an entry in `LINE_TIMING`.
- I2C models attach on `twi0` behind a Renode `DummyI2CSlave` at `addr` (virtual pin `200 + addr`); `on_start` runs at attach (reset time origin).

### Documentation & Actions Checklist
- Add the component entry (including `unit test:`, `implemented:`, and `wiring:` when non-obvious) to [components.md](components.md).
- Register user-facing `do`/`set`/`read`/`send` templates in [`harness/part_actions.json`](../harness/part_actions.json) (excluding fault stimuli or internal jumpers).

---

## Testing & Verification

### Unit & Integration Suites

| Suite | Command |
|---|---|
| Python peripheral models & `Part` registry | `cd parts/test/py && python3 -m pytest .` |
| Frontend parts, elements, and metadata drift | `cd parts/test/ts && ../../node_modules/.bin/vitest run` |
| Harness grammar, action scripts, circuit layout/wiring, `partActions` | `cd harness/test && ../node_modules/.bin/vitest run` |
| Demo catalog parser | `cd demo && ../velxio/frontend/node_modules/.bin/vitest run` |
| Evaluation runner, queue planner & prompt renderer | `python3 eval/test/test_models.py && python3 eval/test/test_run_queue.py && python3 eval/test/test_task_prompt.py` |
| ESP32-S3 GPIO ownership | `cd velxio/backend && PYTHONPATH=../../parts python3 -m pytest tests/test_esp32_gpio_owners.py` |
| SPICE mappers & ratiometric sensors | `cd velxio/frontend && node_modules/.bin/vitest run src/__tests__/component-to-spice.test.ts src/__tests__/ratiometric-sensors.test.ts` |

### End-to-End Selftests & Backend Probes

- **Part selftests**: `bash run.sh --headless selftests/parts/<tag> <target>` (run twice on backend targets to verify deterministic, byte-identical output).
- **WiFi selftests**: `bash run.sh --headless selftests/wifi/<case> esp32s3_espidf` (`peer_error` must exit `1` / `FAIL`).
- **BLE selftests**: `bash run.sh --headless selftests/ble/<case> nrf52840_zephyr` (`peer_error` must exit `1` / `FAIL`).
- **Harness guards**: `selftests/harness/<guard>/` checks timing origins, sampling grain, serial modes, and operation rejections (`rejected_operation` must exit `1` / `FAIL`).
- **Backend probes**: Low-level determinism and bus/peripheral worker probes live in [`selftests/probes/esp32s3_espidf/`](../selftests/probes/esp32s3_espidf/) and [`selftests/probes/nrf52840_zephyr/`](../selftests/probes/nrf52840_zephyr/) (each probe's module docstring gives its build and invocation flags inside `embedgym-sim`).
- **`esp_cloud` selfcheck** (resets services—never run concurrently with an agent batch):

  ```bash
  docker run --rm --network esp_cloud_net \
    -e EMBEDGYM_CLOUD_TOKEN="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' esp_cloud | sed -n 's/^EMBEDGYM_CLOUD_TOKEN=//p')" \
    -v "$PWD/docker/test/esp_cloud/selfcheck.py:/selfcheck.py:ro" \
    embedgym-esp-cloud python3 /selfcheck.py
  ```
