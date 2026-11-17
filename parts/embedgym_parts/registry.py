"""The local part models by sensor type, and how a host wires one.

A host is a simulator that runs the firmware: esp32_worker.py, nrf52_worker.py,
or the browser's AVR simulator through Pyodide
(frontend/src/simulation/python/). It owns the clock, the buses and the GPIOs.
A Part builds a model from the fields its frontend part sends, checks them and
connects the model's hooks through the host (an I2C or SPI bus, a DATA line, a
TRIG/ECHO pair, a keypad's eight nodes, a UART, push-pull outputs); it then takes
the frontend's later values (an HM-10's element actions, an encoder's steps), and
detaches.
"""
from __future__ import annotations

from typing import Callable, Optional, Protocol

from embedgym_parts.dht11 import Dht11Slave
from embedgym_parts.ds18b20 import Ds18b20Slave
from embedgym_parts.hc_sr04 import HcSr04
from embedgym_parts.i2c.amg8833 import AMG8833_INPUTS, AMG8833Slave
from embedgym_parts.i2c.bme280 import BME280Slave
from embedgym_parts.i2c.drv2605l import DRV2605L_ADDR, DRV2605LSlave
from embedgym_parts.i2c.ds1307 import DS1307Slave
from embedgym_parts.i2c.hmc5883l import HMC5883L_ADDR, HMC5883LSlave
from embedgym_parts.i2c.ltr390 import LTR390_ADDR, LTR390Slave
from embedgym_parts.i2c.max17048 import MAX17048_ADDR, MAX17048_INPUTS, MAX17048Slave
from embedgym_parts.i2c.max32664 import MAX32664_ADDR, MAX32664Slave
from embedgym_parts.i2c.mlx90614 import MLX90614_ADDR, MLX90614Slave
from embedgym_parts.i2c.mpr121 import MPR121_CIRCUIT_FIELDS, MPR121_INPUTS, MPR121Slave
from embedgym_parts.i2c.mpu6050 import MPU6050Slave
from embedgym_parts.i2c.pmsa003i import PMSA003I_ADDR, PMSA003ISlave
from embedgym_parts.i2c.sgp40 import SGP40_ADDR, SGP40Slave
from embedgym_parts.i2c.vl53l0x import VL53L0X_ADDR, VL53L0XSlave
from embedgym_parts.hm10 import HM10Module
from embedgym_parts.ky040 import KY040 as KY040Model
from embedgym_parts.membrane_keypad import KeypadMatrix
from embedgym_parts.pa1616s import FRAMING as GPS_FRAMING, STATE_KEYS as GPS_STATE_KEYS, PA1616SModule
from embedgym_parts.pin_uart import PinUart
from embedgym_parts.uart import decode
from embedgym_parts.pulse_sensor import PIR_HOLD_NS, SHOCK_HOLD_NS, PulseSensor

DS1307_ADDR = 0x68
SPI = 'spi'
# Fields naming the part's GPIOs, not values. An I2C bus is the host's own,
# whatever sda_pin / scl_pin say.
PIN_FIELDS = ('sda_pin', 'scl_pin', 'int_pin', 'rst_pin', 'mfio_pin', 'qstart_pin', 'echo_pin',
              *(f'e{n}_pin' for n in range(4, 12)))
# Fields a model takes once, through attach_circuit(fields).
CIRCUIT_FIELDS = MPR121_CIRCUIT_FIELDS
# The hooks a timed model calls with the absolute virtual ns its next event is due.
SCHEDULE_HOOKS = ('on_conversion_scheduled', 'on_measurement_scheduled', 'on_playback_scheduled')


class Timer(Protocol):
    def arm(self, due_ns: int) -> None:
        """Replace the pending deadline; at it, the host calls the tick it was made for."""

    def stop(self) -> None: ...


class Line(Protocol):
    def drive(self, low: bool, at_ns: int) -> None:
        """The part pulls the line LOW, or releases it, at `at_ns` (now or later)."""

    def stop(self) -> None: ...


class Output(Protocol):
    def drive(self, high: bool, at_ns: int) -> None:
        """The level the firmware reads from `at_ns` (now or later)."""

    def stop(self) -> None: ...


class Uart(Protocol):
    def receiver(self) -> Optional[dict]:
        """The framing (embedgym_parts/uart.py) of the firmware's UART receiving on the
        part's TX pin now; None while none listens there."""

    def deliver(self, byte: int) -> None:
        """Into that UART's receiver now; the part paces its own frames."""

    def stop(self) -> None: ...


class Host(Protocol):
    """One attached part's view of its simulator. GPIOs are the host's own pin numbers."""

    pin: int
    """The pin the frontend registers the part on; an I2C part's is virtual."""

    def now_ns(self) -> int:
        """The virtual clock the model keeps time on."""

    def drive_ns(self) -> int:
        """When a value the frontend sends takes effect."""

    def timer(self, tick: Callable[[int], None]) -> Timer: ...

    def mcu_pin(self, gpio: int) -> tuple[Optional[bool], Optional[bool]]:
        """(drive, pull): the level the firmware drives as a GPIO output, None
        while the pin is an input or a released open-drain output; and its pull,
        True (up), False (down) or None."""

    def set_level(self, gpio: int, high: bool) -> None:
        """The level the firmware reads while the pin is an input."""

    def watch(self, gpios: list[int], changed: Callable[[], None]) -> Callable[[], None]:
        """Call `changed` when the firmware changes a pin's level or direction;
        returns the unwatch."""

    def i2c_attach(self, addr: int, model) -> None: ...

    def i2c_move(self, old: int, new: int) -> None: ...

    def i2c_detach(self, addr: int) -> None: ...

    def spi_attach(self, model) -> None:
        """Select the model while the firmware drives this part's CS pin LOW."""

    def spi_detach(self) -> None: ...

    def connect_part_pins(self, model, fields: dict) -> Callable[[], None]:
        """Resolve the model's own pins on the circuit: install its
        `on_pin_drive` and `pin_voltage` and call its `pins_changed`
        (embedgym_parts/mcu_pins.py on a backend host); returns the disconnect."""

    def line(self, on_line: Callable[[bool, int], None]) -> Line:
        """The part's DATA line on this part's pin, idling HIGH on its pull-up,
        which the firmware and the part each pull LOW. The host calls
        `on_line(high, t_ns)` on each change of that wired level."""

    def line_timing(self, sensor_type: str) -> dict:
        """Keyword overrides of a line model's timing for this host's clock;
        empty keeps the datasheet's."""

    def edges(self, on_edge: Callable[[bool, int], None]) -> Callable[[], None]:
        """Call `on_edge(high, t_ns)` on each level change the firmware drives
        on this part's pin, stamped precisely enough to time a µs pulse;
        returns the unwatch."""

    def output(self, gpio: int, high: bool) -> Output:
        """The part's push-pull output on `gpio`, at `high` from now."""

    def uart(self, tx_gpio: Optional[int], rx_gpio: Optional[int],
             on_byte: Callable[[int, dict], None]) -> Optional[Uart]:
        """The part's TX on `tx_gpio` and RX on `rx_gpio`, None when unwired.
        `on_byte(byte, framing)` gets each byte the firmware's UART sends on
        `rx_gpio`, with that UART's framing. None when no UART serves those
        pins: the part drives and samples them itself (embedgym_parts/pin_uart.py)."""

    def on_start(self, start: Callable[[int], None]) -> Callable[[], None]:
        """Call `start(t_ns)` once at the target's time origin, at once when it
        has passed; returns the cancel."""

    def warn(self, message: str) -> None:
        """Report a circuit fault the part tolerates, as hardware would."""

    def report(self, values: dict) -> None:
        """Send the frontend part the element properties that changed."""


def _fixed(name: str, addresses: tuple, make):
    def factory(addr: int, now_ns):
        if addr not in addresses:
            raise ValueError(f'{name}: the address is {" or ".join(f"{a:#x}" for a in addresses)}, got {addr:#x}')
        return make(addr, now_ns)
    return factory


def _kwargs(model, props: dict, values: dict, changed: dict, host: Host) -> None:
    model.update(**{props[k]: float(v) for k, v in values.items()})


def _raw(model, props: dict, values: dict, changed: dict, host: Host) -> None:
    model.update(changed)


def _gauge(model, props: dict, values: dict, changed: dict, host: Host) -> None:
    # batteryConnected is a boolean too, and only the new values apply: a
    # repeated stateOfCharge would restart the SOC integration.
    model.update(changed, host.drive_ns())


def _at_drive(model, props: dict, values: dict, changed: dict, host: Host) -> None:
    model.update(changed, host.drive_ns())


def _rtc(model, props: dict, values: dict, changed: dict, host: Host) -> None:
    at_seconds = host.drive_ns() / 1e9
    for key, value in changed.items():
        if key == 'epoch':
            model.set_epoch(float(value), at_seconds=at_seconds)
        elif key == 'running':
            if type(value) is not bool:
                raise ValueError(f'ds1307: running takes true or false, got {value!r}')
            model.set_running(value, at_seconds=at_seconds)
        else:
            raise ValueError(f'ds1307: no property {key!r}')


BME280_PROPS = {'temperature': 'temperature_c', 'pressure': 'pressure_hpa', 'humidity': 'humidity_pct'}
# sensor_type → (model from (addr, virtual clock), frontend property → update keyword, update style)
I2C_PARTS = {
    'mpu6050': (_fixed('mpu6050', (0x68, 0x69), lambda addr, now_ns: MPU6050Slave(addr)), {
        'accelX': 'accel_x', 'accelY': 'accel_y', 'accelZ': 'accel_z',
        'gyroX': 'gyro_x', 'gyroY': 'gyro_y', 'gyroZ': 'gyro_z', 'temp': 'temp',
    }, _kwargs),
    'ds1307': (_fixed('ds1307', (DS1307_ADDR,), lambda addr, now_ns: DS1307Slave(lambda: now_ns() / 1e9)),
               {'epoch': 'epoch', 'running': 'running'}, _rtc),
    'ltr390': (_fixed('ltr390', (LTR390_ADDR,), lambda addr, now_ns: LTR390Slave(now_ns)),
               {'als': 'als', 'uvs': 'uvs'}, _kwargs),
    'hmc5883l': (_fixed('hmc5883l', (HMC5883L_ADDR,), lambda addr, now_ns: HMC5883LSlave(now_ns)),
                 {'magneticX': 'magnetic_x', 'magneticY': 'magnetic_y', 'magneticZ': 'magnetic_z'}, _kwargs),
    'amg8833': (_fixed('amg8833', (0x68, 0x69), AMG8833Slave), {key: key for key in AMG8833_INPUTS}, _raw),
    'max17048': (_fixed('max17048', (MAX17048_ADDR,), lambda addr, now_ns: MAX17048Slave(now_ns)),
                 {key: key for key in MAX17048_INPUTS}, _gauge),
    'mpr121': (_fixed('mpr121', (0x5A, 0x5B, 0x5C, 0x5D), MPR121Slave), {key: key for key in MPR121_INPUTS}, _raw),
    'bme280': (_fixed('bme280', (0x76, 0x77), lambda addr, now_ns: BME280Slave(addr, now_ns=now_ns)),
               BME280_PROPS, _kwargs),
    'vl53l0x': (_fixed('vl53l0x', (VL53L0X_ADDR,), lambda addr, now_ns: VL53L0XSlave(now_ns)),
                {'distance': 'distance'}, _kwargs),
    'sgp40': (_fixed('sgp40', (SGP40_ADDR,), lambda addr, now_ns: SGP40Slave(now_ns)), {'raw': 'raw'}, _kwargs),
    'pmsa003i': (_fixed('pmsa003i', (PMSA003I_ADDR,), lambda addr, now_ns: PMSA003ISlave()),
                 {'pm1_0': 'pm1_0', 'pm2_5': 'pm2_5', 'pm10': 'pm10'}, _kwargs),
    'max32664': (_fixed('max32664', (MAX32664_ADDR,), lambda addr, now_ns: MAX32664Slave()),
                 {k: k for k in ('heartRate', 'confidence', 'oxygen', 'status', 'rValue', 'extStatus')}, _kwargs),
    'mlx90614': (_fixed('mlx90614', (MLX90614_ADDR,), lambda addr, now_ns: MLX90614Slave(now_ns)),
                 {'objectTemperature': 'objectTemperature', 'ambientTemperature': 'ambientTemperature'}, _at_drive),
    'drv2605l': (_fixed('drv2605l', (DRV2605L_ADDR,), lambda addr, now_ns: DRV2605LSlave(now_ns)), {}, _raw),
}
# sensor_type → (model from the virtual clock, frontend property → update keyword, update style);
# a model answers spi_transfer(mosi) → miso and spi_deselect().
SPI_PARTS = {
    'bme280': (lambda now_ns: BME280Slave(now_ns=now_ns), BME280_PROPS, _kwargs),
}
# sensor_type → (property → accepted range, model from (property reader, line drive, host timing));
# the model reads a property when it samples it and takes on_line(high, t_ns).
LINE_PARTS = {
    'dht11': ({'temperature': (0, 50), 'humidity': (20, 90)},
              lambda read, drive, timing: Dht11Slave(lambda: (read('temperature'), read('humidity')), drive, **timing)),
    'ds18b20': ({'temperature': (-55, 125)},
                lambda read, drive, timing: Ds18b20Slave(lambda: read('temperature'), drive, **timing)),
}
SONAR = 'hc-sr04'
KEYPAD = 'membrane-keypad'
# Nodes R2..R4 and C1..C4, absent when unwired; R1 is the part's own pin.
KEYPAD_PIN_FIELDS = ('r2_pin', 'r3_pin', 'r4_pin', 'c1_pin', 'c2_pin', 'c3_pin', 'c4_pin')
GPS = 'pa1616s'
GPS_PIN_FIELDS = ('rx_pin', 'fix_pin', 'pps_pin')
HM10 = 'hm10'
# `pressed`: the pad buttons (resetDown, keyDown) held since before the attach.
HM10_FIELDS = frozenset({'tx_pin', 'rx_pin', 'rx_net', 'pads', 'identity', 'retained', 'partner', 'pressed'})
HM10_PRESSES = ('resetDown', 'keyDown')
# sensor_type → (the property that triggers it, how long its output stays HIGH)
PULSE_PARTS = {
    'pir-motion-sensor': ('trigger', PIR_HOLD_NS),
    'shock-sensor': ('shock', SHOCK_HOLD_NS),
}
KY040 = 'ky-040'
# CLK is the part's own pin; `pressed`: SW held since before the attach.
KY040_FIELDS = ('dt_pin', 'sw_pin', 'pressed')
TYPES = frozenset(I2C_PARTS) | frozenset(LINE_PARTS) | frozenset(PULSE_PARTS) | {SONAR, KEYPAD, GPS, HM10, KY040}


def _sampled(model, props: dict, values: dict, changed: dict, host: Host) -> None:
    pass


def _distance(model, props: dict, values: dict, changed: dict, host: Host) -> None:
    model.set_distance(float(values['distance']))


def _trigger(model, props: dict, values: dict, changed: dict, host: Host) -> None:
    for key, value in changed.items():
        if value is not True:
            raise ValueError(f'{model.name}: {key} takes true, got {value!r}')
        model.trigger(host.drive_ns())


def _turn(model, props: dict, values: dict, changed: dict, host: Host) -> None:
    for key, value in changed.items():
        if key == 'step':
            model.step(value, host.drive_ns())
        elif type(value) is bool:
            model.press(value, host.drive_ns())
        else:
            raise ValueError(f'{KY040}: pressed takes true or false, got {value!r}')


def _act(model, props: dict, values: dict, changed: dict, host: Host) -> None:
    if not {'action', 'partner'} <= set(changed):
        raise ValueError(f'{HM10}: an action takes action, partner and data, got {sorted(changed)}')
    model.action(changed['action'], changed['partner'], changed.get('data'))


class Part:
    """An attached part: `update` takes the frontend's values, `detach` releases the host."""

    def __init__(self, sensor_type: str, fields: dict, host: Host) -> None:
        self.type = sensor_type
        self.host = host
        self.values: dict = {}
        self.timer: Optional[Timer] = None
        self.unwatch: list[Callable[[], None]] = []
        self.addr: Optional[int] = None
        self.ranges: dict = {}
        transport = fields.get('transport')
        self.spi = transport == SPI
        if transport == SPI:
            if sensor_type not in SPI_PARTS:
                raise ValueError(f'{sensor_type}: only {sorted(SPI_PARTS)} attach on SPI')
            make, self.props, self.apply = SPI_PARTS[sensor_type]
            self.model = make(host.now_ns)
            host.spi_attach(self.model)
            values = {k: v for k, v in fields.items() if k != 'transport'}
        elif sensor_type in LINE_PARTS:
            self.ranges, make = LINE_PARTS[sensor_type]
            self.props, self.apply = {key: key for key in self.ranges}, _sampled
            if set(fields) != set(self.ranges):
                raise ValueError(f'{sensor_type}: attaches with {sorted(self.ranges)}, got {sorted(fields)}')
            line = host.line(lambda high, t_ns: self.model.on_line(high, t_ns))
            self.unwatch.append(line.stop)
            self.model = make(lambda key: float(self.values[key]), line.drive, host.line_timing(sensor_type))
            values = fields
        elif sensor_type == SONAR:
            self.props, self.apply = {'distance': 'distance'}, _distance
            if set(fields) != {'distance', 'echo_pin'}:
                raise ValueError(f'{SONAR}: attaches with distance and echo_pin, got {sorted(fields)}')
            echo = host.output(int(fields['echo_pin']), False)
            self.unwatch.append(echo.stop)
            self.model = HcSr04(echo.drive, float(fields['distance']))
            self.unwatch.append(host.edges(self.model.on_trig))
            values = {}
        elif sensor_type == KEYPAD:
            if 'keys' not in fields or not set(fields) <= {'keys', *KEYPAD_PIN_FIELDS}:
                raise ValueError(f'{KEYPAD}: attaches with keys and the wired ones of {list(KEYPAD_PIN_FIELDS)}, got {sorted(fields)}')
            self.props = {'keys': 'keys'}
            self.model = KeypadMatrix(host.warn)
            self.apply = self._connect_keypad([host.pin] + [None if fields.get(key) is None else int(fields[key])
                                                            for key in KEYPAD_PIN_FIELDS])
            values = {'keys': fields['keys']}
        elif sensor_type == GPS:
            # TX is the part's own pin.
            pins = {key: None if fields.get(key) is None else int(fields[key]) for key in GPS_PIN_FIELDS}
            self.props, self.apply = {key: key for key in GPS_STATE_KEYS}, _raw
            uart = host.uart(host.pin, pins['rx_pin'], lambda byte, framing: self.model.on_byte(byte, framing))
            drives = {}
            for key in ('fix_pin', 'pps_pin'):
                if pins[key] is not None:
                    output = host.output(pins[key], False)
                    self.unwatch.append(output.stop)
                    drives[key] = output.drive
            self.timer = host.timer(lambda now_ns: self.model.tick(now_ns))
            receiver, deliver = (None, None) if uart is None else (uart.receiver, uart.deliver)
            self.model = PA1616SModule(host.now_ns, receiver, deliver, self.timer.arm, drives.get('fix_pin'), drives.get('pps_pin'))
            if uart is None:
                self.model.wire = PinUart(GPS, host, host.pin, pins['rx_pin'], lambda: GPS_FRAMING, lambda: None,
                                          lambda bits, framing: self.model.on_byte(decode(GPS, bits, framing), framing))
                self.unwatch.append(self.model.wire.stop)
            else:
                self.unwatch.append(uart.stop)
            self.unwatch.append(host.on_start(self.model.start))
            values = {key: value for key, value in fields.items() if key not in GPS_PIN_FIELDS}
        elif sensor_type == HM10:
            self._attach_hm10(fields)
            values = {}
        elif sensor_type in PULSE_PARTS:
            prop, hold_ns = PULSE_PARTS[sensor_type]
            if fields:
                raise ValueError(f'{sensor_type}: attaches with no fields, got {sorted(fields)}')
            self.props, self.apply = {prop: prop}, _trigger
            output = host.output(host.pin, False)
            self.unwatch.append(output.stop)
            self.model = PulseSensor(sensor_type, output.drive, hold_ns)
            values = {}
        elif sensor_type == KY040:
            if not {'dt_pin', 'pressed'} <= set(fields) <= set(KY040_FIELDS):
                raise ValueError(f'{KY040}: attaches with dt_pin, pressed and a wired sw_pin, got {sorted(fields)}')
            self.props, self.apply = {'step': 'step', 'pressed': 'pressed'}, _turn
            clk = host.output(host.pin, True)
            dt = host.output(int(fields['dt_pin']), True)
            sw = None if fields.get('sw_pin') is None else host.output(int(fields['sw_pin']), True)
            self.unwatch += [output.stop for output in (clk, dt, sw) if output is not None]
            self.model = KY040Model(clk.drive, dt.drive, None if sw is None else sw.drive)
            values = {'pressed': True} if fields['pressed'] else {}
        elif transport is None:
            if sensor_type not in I2C_PARTS:
                raise ValueError(f'{sensor_type}: not a local part model (local parts: {sorted(TYPES)})')
            make, self.props, self.apply = I2C_PARTS[sensor_type]
            if 'mfio_pin' in fields and 'rst_pin' not in fields:
                raise ValueError(f'{sensor_type}: mfio_pin comes only with rst_pin, got {sorted(fields)}')
            self.addr = int(fields['addr'])
            self.model = make(self.addr, host.now_ns)
            self._attach_i2c(fields)
            values = {k: v for k, v in fields.items()
                      if k != 'addr' and k not in PIN_FIELDS and k not in CIRCUIT_FIELDS}
        else:
            raise ValueError(f'{sensor_type}: transport must be {SPI!r} or absent, got {transport!r}')
        if values:
            self.update(values)

    def _attach_i2c(self, fields: dict) -> None:
        model, host = self.model, self.host
        if hasattr(model, 'on_address_change'):
            model.on_address_change = self._move
        host.i2c_attach(self.addr, model)
        hooks = [hook for hook in SCHEDULE_HOOKS if hasattr(model, hook)]
        if hooks:
            self.timer = host.timer(model.tick)
            for hook in hooks:
                setattr(model, hook, self.timer.arm)
        if hasattr(model, 'attach_circuit'):
            model.attach_circuit(fields)
        if hasattr(model, 'pins_changed'):
            # The host resolves all of the model's own pins, INT included.
            self.unwatch.append(host.connect_part_pins(model, fields))
        elif 'int_pin' in fields:
            gpio = int(fields['int_pin'])
            if not hasattr(model, 'on_interrupt_change'):
                raise ValueError(f'{self.type}: no interrupt output for pin {gpio}')
            # Active-low open drain, idling HIGH.
            model.on_interrupt_change = lambda asserted: host.set_level(gpio, not asserted)
            host.set_level(gpio, True)
        if hasattr(model, 'on_state'):
            model.on_state = host.report
        if hasattr(model, 'set_time_origin'):
            self.unwatch.append(host.on_start(model.set_time_origin))
        if hasattr(model, 'power_on'):
            model.power_on()
        if 'rst_pin' in fields:
            if not hasattr(model, 'set_reset_pin'):
                raise ValueError(f'{self.type}: no reset input for pin {fields["rst_pin"]}')
            self._connect_hub_reset(int(fields['rst_pin']), int(fields['mfio_pin']) if 'mfio_pin' in fields else None)
        if hasattr(model, 'set_bus_pins'):
            self._connect_gauge_pins(int(fields['qstart_pin']) if 'qstart_pin' in fields else None,
                                     int(fields['sda_pin']), int(fields['scl_pin']))
        elif 'qstart_pin' in fields:
            raise ValueError(f'{self.type}: no QStart input for pin {fields["qstart_pin"]}')

    def _move(self, old: int, new: int) -> None:
        self.host.i2c_move(old, new)
        self.addr = new

    def _connect_hub_reset(self, rst: int, mfio: Optional[int]) -> None:
        """The MAX32664's RST, idling HIGH on the hub's pull-up. The hub reads
        MFIO as RST rises: the level the firmware drives, or its pull-up while
        the firmware holds the pin as an input. An unwired MFIO reads HIGH."""
        host = self.host

        def changed() -> None:
            drive = host.mcu_pin(rst)[0]
            if mfio is None:
                mfio_high = True
            else:
                mfio_drive, mfio_pull = host.mcu_pin(mfio)
                mfio_high = mfio_pull is True if mfio_drive is None else mfio_drive
            self.model.set_reset_pin(True if drive is None else drive, mfio_high)

        self.unwatch.append(host.watch([rst] if mfio is None else [rst, mfio], changed))

    def _connect_gauge_pins(self, qstart: Optional[int], sda: int, scl: int) -> None:
        """The MAX17048's inputs. QStart has no pull of its own: it is HIGH while
        the firmware drives it HIGH or pulls it up. SDA and SCL idle HIGH on the
        breakout's pull-ups and are LOW only while the firmware drives them LOW
        as GPIO outputs."""
        host, model = self.host, self.model

        def bus() -> tuple:
            return (host.mcu_pin(sda)[0] is not False, host.mcu_pin(scl)[0] is not False)

        def quick_start_high() -> bool:
            drive, pull = host.mcu_pin(qstart)
            return drive is True or (drive is None and pull is True)

        if qstart is not None:
            model.set_quick_start_pin(quick_start_high(), initial=True)
        lines = [bus()]
        model.set_bus_pins(*lines[0])

        def changed() -> None:
            if qstart is not None:
                model.set_quick_start_pin(quick_start_high())
            now = bus()
            if now != lines[0]:
                lines[0] = now
                model.set_bus_pins(*now)

        self.unwatch.append(host.watch([gpio for gpio in (qstart, sda, scl) if gpio is not None], changed))

    def _attach_hm10(self, fields: dict) -> None:
        """The module on its UART and its pads' GPIOs; it powers on at the
        target's time origin. The frontend resolved each pad's net (`gpio`
        plus embedgym_parts/hm10.py's net) and RXD's."""
        host = self.host
        if set(fields) != HM10_FIELDS:
            raise ValueError(f'{HM10}: attaches with {sorted(HM10_FIELDS)}, got {sorted(fields)}')
        if any(press not in HM10_PRESSES for press in fields['pressed']):
            raise ValueError(f'{HM10}: pressed takes {list(HM10_PRESSES)}, got {fields["pressed"]}')
        tx, rx = (None if fields[key] is None else int(fields[key]) for key in ('tx_pin', 'rx_pin'))
        if (rx is None) != (fields['rx_net'] is None):
            raise ValueError(f'{HM10}: rx_net comes exactly with rx_pin, got rx_pin {rx} and rx_net {fields["rx_net"]!r}')
        pads = fields['pads']
        gpios = {pad: int(net['gpio']) for pad, net in pads.items() if net['gpio'] is not None}
        self.props, self.apply = {'action': 'action', 'partner': 'partner', 'data': 'data'}, _act
        model = self.model = HM10Module(host.now_ns, fields['identity'], fields['retained'],
                                        {pad: {key: net[key] for key in ('series', 'high', 'load')} for pad, net in pads.items()},
                                        fields['rx_net'], fields['partner'])
        self.timer = host.timer(model.tick)
        model.on_schedule = self.timer.arm
        model.on_state = host.report
        model.mcu_output = lambda pad: host.mcu_pin(gpios[pad])[0]
        model.on_mcu_level = lambda pad, high: host.set_level(gpios[pad], high)
        uart = host.uart(tx, rx, model.mcu_byte)
        if uart is None:
            model.wire = PinUart(HM10, host, tx, rx, model.module_framing, model.mcu_frame_started, model.mcu_frame)
            model.mcu_receiver = lambda: None
            self.unwatch.append(model.wire.stop)
        else:
            model.mcu_receiver = uart.receiver
            model.deliver = uart.deliver
            self.unwatch.append(uart.stop)
        self.unwatch.append(host.watch(list(gpios.values()), model.mcu_pins_changed))

        def start(_t_ns: int) -> None:
            model.power_on()
            for press in fields['pressed']:
                model.action(press, fields['partner'])
        self.unwatch.append(host.on_start(start))

    def _connect_keypad(self, gpios: list) -> Callable:
        """The matrix on its eight nodes, rows then columns, None when unwired.
        Every wired pin the firmware does not drive reads its node's level,
        resolved again on each level or direction change of the eight pins, so
        a node follows a strobe before the firmware's next instruction. Returns
        the update style for the pressed keys."""
        host, model = self.host, self.model
        wired = [gpio for gpio in gpios if gpio is not None]
        if len(set(wired)) != len(wired):
            raise ValueError(f'{KEYPAD}: two nodes share a pin ({gpios})')

        def resolve() -> None:
            nodes = [None if gpio is None else host.mcu_pin(gpio) for gpio in gpios]
            for gpio, level in zip(gpios, model.levels(nodes)):
                if level is not None:
                    host.set_level(gpio, level)

        def press(model, props: dict, values: dict, changed: dict, host: Host) -> None:
            model.press(values['keys'])
            resolve()

        self.unwatch.append(host.watch(wired, resolve))
        return press

    def update(self, values: dict) -> None:
        for key, value in values.items():
            if key not in self.props:
                raise ValueError(f'{self.type}: no property {key!r}')
            if key in self.ranges:
                low, high = self.ranges[key]
                if not low <= float(value) <= high:
                    raise ValueError(f'{self.type}: {key} {value} is outside {low}..{high}')
        self.values.update(values)
        self.apply(self.model, self.props, self.values, values, self.host)

    def detach(self) -> None:
        if self.timer is not None:
            self.timer.stop()
        for unwatch in self.unwatch:
            unwatch()
        if self.spi:
            self.host.spi_detach()
        elif self.addr is not None:
            self.host.i2c_detach(self.addr)
