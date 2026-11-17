"""Unit tests for embedgym_parts/registry.py (Part): the wiring every host shares, over a
fake host that records what the part asks of it."""
from __future__ import annotations

import pytest

from embedgym_parts.i2c.hmc5883l import HMC5883LSlave
from embedgym_parts.pa1616s import BYTE_NS, FRAMING, nmea_wrap
from embedgym_parts.registry import Part
from embedgym_parts.uart import decode, encode, frame_bits
from i2c_bus import MS_NS, read_regs, write_regs
from test_hm10 import PARTNER


class FakeTimer:
    def __init__(self, host: FakeHost, tick) -> None:
        self.host = host
        self.tick = tick
        self.due: int | None = None
        self.stopped = False

    def arm(self, due_ns: int) -> None:
        self.due = due_ns

    def stop(self) -> None:
        self.stopped = True


class FakeLine:
    def __init__(self, on_line) -> None:
        self.on_line = on_line
        self.drives: list[tuple[bool, int]] = []
        self.stopped = False

    def drive(self, low: bool, at_ns: int) -> None:
        self.drives.append((low, at_ns))

    def stop(self) -> None:
        self.stopped = True


class FakeOutput:
    def __init__(self, gpio: int, high: bool) -> None:
        self.gpio = gpio
        self.levels: list[tuple[bool, int]] = [(high, 0)]
        self.stopped = False

    def drive(self, high: bool, at_ns: int) -> None:
        self.levels.append((high, at_ns))

    def stop(self) -> None:
        self.stopped = True


class FakeUart:
    def __init__(self, host: FakeHost, tx_gpio, rx_gpio, on_byte) -> None:
        self.host = host
        self.pins = (tx_gpio, rx_gpio)
        self.on_byte = on_byte
        self.framing: dict | None = dict(FRAMING)
        self.delivered: list[tuple[int, int]] = []
        self.stopped = False

    def receiver(self) -> dict | None:
        return self.framing

    def deliver(self, byte: int) -> None:
        self.delivered.append((byte, self.host.now))

    def stop(self) -> None:
        self.stopped = True


class FakeHost:
    """`uarts=False` is a host with no UART on the part's pins (the Uno)."""

    def __init__(self, pin: int = 0, uarts: bool = True) -> None:
        self.pin = pin
        self.has_uarts = uarts
        self.warnings: list[str] = []
        self.now = 0
        self.pins: dict[int, tuple] = {}
        self.levels: list[tuple[int, bool]] = []
        self.watches: list[tuple[list, object]] = []
        self.i2c: dict[int, object] = {}
        self.spi = None
        self.timers: list[FakeTimer] = []
        self.part_pins: list = []
        self.lines: list[FakeLine] = []
        self.outputs: list[FakeOutput] = []
        self.on_edge = None
        self.uarts: list[FakeUart] = []
        self.state: dict = {}

    def now_ns(self) -> int:
        return self.now

    def drive_ns(self) -> int:
        return self.now

    def timer(self, tick) -> FakeTimer:
        self.timers.append(FakeTimer(self, tick))
        return self.timers[-1]

    def mcu_pin(self, gpio: int) -> tuple:
        return self.pins.get(gpio, (None, None))

    def set_level(self, gpio: int, high: bool) -> None:
        self.levels.append((gpio, high))

    def watch(self, gpios: list, changed):
        entry = (gpios, changed)
        self.watches.append(entry)
        return lambda: self.watches.remove(entry)

    def drive(self, gpio: int, state: tuple) -> None:
        self.pins[gpio] = state
        for gpios, changed in list(self.watches):
            if gpio in gpios:
                changed()

    def i2c_attach(self, addr: int, model) -> None:
        assert addr not in self.i2c
        self.i2c[addr] = model

    def i2c_move(self, old: int, new: int) -> None:
        self.i2c[new] = self.i2c.pop(old)

    def i2c_detach(self, addr: int) -> None:
        del self.i2c[addr]

    def spi_attach(self, model) -> None:
        self.spi = model

    def spi_detach(self) -> None:
        self.spi = None

    def connect_part_pins(self, model, fields: dict):
        model.on_pin_drive = lambda pin, drive: None
        model.pin_voltage = lambda pin: None
        self.part_pins.append((model, fields))
        return lambda: self.part_pins.remove((model, fields))

    def line(self, on_line) -> FakeLine:
        self.lines.append(FakeLine(on_line))
        return self.lines[-1]

    def line_timing(self, sensor_type: str) -> dict:
        return {'start_min_ns': 1_000_000} if sensor_type == 'dht11' else {}

    def edges(self, on_edge):
        self.on_edge = on_edge

        def unwatch() -> None:
            self.on_edge = None
        return unwatch

    def output(self, gpio: int, high: bool) -> FakeOutput:
        self.outputs.append(FakeOutput(gpio, high))
        return self.outputs[-1]

    def uart(self, tx_gpio, rx_gpio, on_byte) -> FakeUart | None:
        if not self.has_uarts:
            return None
        self.uarts.append(FakeUart(self, tx_gpio, rx_gpio, on_byte))
        return self.uarts[-1]

    def on_start(self, start):
        start(self.now)
        return lambda: None

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def report(self, values: dict) -> None:
        self.state.update(values)

    def advance(self, ms: float) -> None:
        self.advance_to(self.now + round(ms * MS_NS))

    def advance_to(self, target: int) -> None:
        """Fire the timers due by `target`, earliest first."""
        while True:
            due = [timer for timer in self.timers if not timer.stopped and timer.due is not None and timer.due <= target]
            if not due:
                break
            timer = min(due, key=lambda timer: timer.due)
            self.now, timer.due = timer.due, None
            timer.tick(self.now)
        self.now = target

    def send_frame(self, gpio: int, bits: list, baud: int) -> None:
        """The firmware bit-bangs one frame on `gpio` from now."""
        start = self.now
        for index, level in enumerate(bits):
            self.advance_to(start + round(index * 1e9 / baud))
            self.drive(gpio, (level, None))
        self.advance_to(start + round(len(bits) * 1e9 / baud))


def wire_bytes(output: FakeOutput, framing: dict) -> bytes:
    """The frames on a part's TX, read the way the firmware's software UART samples them."""
    bit = 1e9 / framing['baud']

    def level(t: float) -> bool:
        return [high for high, at in output.levels if at <= t][-1]
    received, free = [], 0
    for (was, _), (high, at) in zip(output.levels, output.levels[1:]):
        if was and not high and at >= free:
            received.append(decode('test', [level(at + (index + 0.5) * bit) for index in range(frame_bits(framing))], framing))
            free = at + (frame_bits(framing) - 0.5) * bit
    return bytes(received)


def test_i2c_part_attaches_at_its_address_with_timer_int_pin_and_values():
    host = FakeHost()
    part = Part('hmc5883l', {'addr': 0x1E, 'int_pin': 7, 'sda_pin': 20, 'scl_pin': 21, 'magneticX': 0.5}, host)
    model = host.i2c[0x1E]
    assert isinstance(model, HMC5883LSlave)
    assert host.levels == [(7, True)]
    assert model.field[0] == 0.5
    host.advance(60)
    assert (7, False) in host.levels
    assert read_regs(model, 3, 2) == [545 >> 8, 545 & 0xFF]

    part.detach()
    assert host.i2c == {} and host.timers[0].stopped


def test_update_checks_properties_and_converts_values():
    host = FakeHost()
    part = Part('hmc5883l', {'addr': 0x1E}, host)
    part.update({'magneticY': '0.25'})
    assert host.i2c[0x1E].field[1] == 0.25
    with pytest.raises(ValueError, match="no property 'pressure'"):
        part.update({'pressure': 1000})


def test_fixed_address_and_unknown_type_and_transport_are_rejected():
    with pytest.raises(ValueError, match='hmc5883l: the address is 0x1e'):
        Part('hmc5883l', {'addr': 0x1F}, FakeHost())
    with pytest.raises(ValueError, match='not a local part model'):
        Part('ssd1306', {'addr': 0x3C}, FakeHost())
    with pytest.raises(ValueError, match="transport must be 'spi'"):
        Part('bme280', {'addr': 0x76, 'transport': 'i2c'}, FakeHost())
    with pytest.raises(ValueError, match='only'):
        Part('hmc5883l', {'transport': 'spi'}, FakeHost())


def test_spi_part_sits_behind_the_host_cs():
    host = FakeHost()
    part = Part('bme280', {'transport': 'spi', 'temperature': 30}, host)
    assert host.spi is not None and host.i2c == {}
    part.detach()
    assert host.spi is None


def test_ds1307_takes_the_epoch():
    part = Part('ds1307', {'addr': 0x68, 'epoch': 1_700_000_000}, FakeHost())
    # 22:13:20 UTC, the oscillator still halted (CH) as at power-up.
    assert read_regs(part.model, 0, 3) == [0x80 | 0x20, 0x13, 0x22]


def test_ds1307_running_clears_ch_at_the_drive_time():
    host = FakeHost()
    part = Part('ds1307', {'addr': 0x68}, host)
    host.now = 2_500_000_000
    part.update({'running': True})
    host.now = 3_500_000_000
    assert read_regs(part.model, 0, 1) == [0x01]
    part.update({'epoch': 1_700_000_000})   # 22:13:20; running is not reapplied
    host.now = 4_500_000_000
    assert read_regs(part.model, 0, 1) == [0x21]
    part.update({'running': False})
    host.now = 9_000_000_000
    assert read_regs(part.model, 0, 1) == [0x80 | 0x21]
    with pytest.raises(ValueError, match='ds1307: running takes true or false'):
        part.update({'running': 1})


def test_mlx90614_powers_on_at_attach_and_takes_temperatures_at_the_drive_time():
    host = FakeHost()
    host.now = 100 * MS_NS
    part = Part('mlx90614', {'addr': 0x5A, 'sda_pin': 20, 'scl_pin': 21,
                             'objectTemperature': 28.75, 'ambientTemperature': 20.01}, host)
    assert host.i2c[0x5A] is part.model
    host.now = 350 * MS_NS
    lsb, msb, _ = read_regs(part.model, 0x07, 3)
    assert lsb | (msb << 8) == 0x3AF7
    part.update({'ambientTemperature': 30.01})
    host.now = 450 * MS_NS
    lsb, msb, _ = read_regs(part.model, 0x06, 3)
    assert lsb | (msb << 8) == round((30.01 + 273.15) * 50)
    with pytest.raises(ValueError, match='mlx90614: the address is 0x5a'):
        Part('mlx90614', {'addr': 0x5B}, FakeHost())
    part.detach()
    assert host.i2c == {}


def test_drv2605l_reports_state_and_plays_on_the_host_timer():
    host = FakeHost()
    host.now = 5 * MS_NS
    part = Part('drv2605l', {'addr': 0x5A, 'sda_pin': 20, 'scl_pin': 21}, host)
    assert host.i2c[0x5A] is part.model
    assert host.state['standby'] is True and host.state['effects'] == ''
    write_regs(part.model, 0x01, 0x00)
    write_regs(part.model, 0x04, 47, 0)
    host.now = 255 * MS_NS
    write_regs(part.model, 0x0C, 0x01)
    assert host.state['go'] is True and host.state['lastEffect'] == 47 and host.state['lastEffectMs'] == 250.0
    host.advance(100)
    assert read_regs(part.model, 0x0C, 1) == [0] and host.state['go'] is False and host.state['effectCount'] == 1
    with pytest.raises(ValueError, match='drv2605l: no property'):
        part.update({'effect': 1})
    with pytest.raises(ValueError, match='drv2605l: the address is 0x5a'):
        Part('drv2605l', {'addr': 0x5B}, FakeHost())
    part.detach()
    assert host.i2c == {} and host.timers[0].stopped


def test_hub_reset_samples_mfio_as_rst_rises():
    host = FakeHost()
    host.pins[5] = (True, None)
    host.pins[6] = (True, None)
    part = Part('max32664', {'addr': 0x55, 'rst_pin': 5, 'mfio_pin': 6}, host)
    host.drive(5, (False, None))
    host.drive(6, (None, True))
    host.drive(5, (True, None))
    assert part.model.device_mode == 0x00
    host.drive(5, (False, None))
    host.drive(6, (False, None))
    host.drive(5, (None, None))
    assert part.model.device_mode == 0x08
    part.detach()
    assert host.watches == []


def test_gauge_quick_starts_on_a_qstart_rise_and_sees_the_bus_lines():
    host = FakeHost()
    part = Part('max17048', {'addr': 0x36, 'qstart_pin': 4, 'sda_pin': 20, 'scl_pin': 21}, host)
    assert (part.model.bus_sda_high, part.model.bus_scl_high) == (True, True)
    host.drive(20, (False, None))
    assert part.model.bus_sda_high is False
    host.drive(20, (None, None))
    assert part.model.bus_sda_high is True
    assert part.model.quick_pin_high is False
    host.drive(4, (None, True))
    assert part.model.quick_pin_high is True
    host.drive(4, (None, None))
    assert part.model.quick_pin_high is False
    host.drive(4, (True, None))
    assert part.model.quick_pin_high is True


def test_mfio_without_rst_is_rejected():
    with pytest.raises(ValueError, match='mfio_pin comes only with rst_pin'):
        Part('max32664', {'addr': 0x55, 'mfio_pin': 6}, FakeHost())


def test_mpr121_pins_and_int_go_to_the_host_and_power_on_after_them():
    host = FakeHost()
    fields = {'addr': 0x5A, 'powered': True, 'electrodes': {}, 'int_pin': 3, 'capacitance0': 20}
    part = Part('mpr121', fields, host)
    assert host.part_pins == [(part.model, fields)] and host.levels == []
    assert part.model.started and part.model.inputs['capacitance'][0] == 20
    part.detach()
    assert host.part_pins == [] and host.i2c == {}


def test_vl53l0x_moves_on_the_host_bus():
    host = FakeHost()
    part = Part('vl53l0x', {'addr': 0x29}, host)
    write_regs(part.model, 0x8A, 0x30)
    assert list(host.i2c) == [0x30]
    part.detach()
    assert host.i2c == {}


def test_dht11_answers_on_its_line_with_the_reading_at_the_start_signal():
    host = FakeHost()
    part = Part('dht11', {'temperature': 20, 'humidity': 50}, host)
    line = host.lines[0]
    part.update({'temperature': 31})
    line.on_line(False, 0)
    # The host's 1 ms start threshold, not the datasheet's 18 ms.
    line.on_line(True, 1_000_000)
    assert line.drives[0] == (True, 1_020_000) and len(line.drives) == 84
    part.detach()
    assert line.stopped


def test_line_parts_check_their_values():
    with pytest.raises(ValueError, match='attaches with'):
        Part('dht11', {'temperature': 20}, FakeHost())
    part = Part('ds18b20', {'temperature': 20}, FakeHost())
    with pytest.raises(ValueError, match='temperature 126 is outside -55..125'):
        part.update({'temperature': 126})
    with pytest.raises(ValueError, match="no property 'humidity'"):
        part.update({'humidity': 50})


def test_hc_sr04_times_trig_and_drives_echo():
    host = FakeHost()
    part = Part('hc-sr04', {'distance': 100, 'echo_pin': 9}, host)
    echo = host.outputs[0]
    assert echo.gpio == 9 and echo.levels == [(False, 0)]
    part.update({'distance': 50})
    host.on_edge(True, 0)
    host.on_edge(False, 10_000)
    assert echo.levels[1:] == [(True, 610_000), (False, 610_000 + round(50 / 17150 * 1e9))]
    with pytest.raises(ValueError, match='outside 2..400'):
        part.update({'distance': 1})
    part.detach()
    assert echo.stopped and host.on_edge is None


def test_pulse_parts_drive_their_pin_high_for_their_hold_time_on_a_trigger():
    host = FakeHost(pin=5)
    part = Part('shock-sensor', {}, host)
    out = host.outputs[0]
    host.now = 1_000
    part.update({'shock': True})
    assert out.gpio == 5 and out.levels == [(False, 0), (True, 1_000), (False, 50_001_000)]
    with pytest.raises(ValueError, match='shock-sensor: shock takes true, got False'):
        part.update({'shock': False})
    with pytest.raises(ValueError, match="no property 'trigger'"):
        part.update({'trigger': True})
    part.detach()
    assert out.stopped
    Part('pir-motion-sensor', {}, host).update({'trigger': True})
    assert host.outputs[1].levels[1:] == [(True, 1_000), (False, 3_000_001_000)]
    with pytest.raises(ValueError, match='attaches with no fields'):
        Part('pir-motion-sensor', {'pin': 5}, host)


def test_ky040_drives_clk_dt_and_sw_from_steps_and_presses():
    host = FakeHost(pin=2)
    part = Part('ky-040', {'dt_pin': 3, 'sw_pin': 4, 'pressed': True}, host)
    clk, dt, sw = host.outputs
    assert (clk.gpio, dt.gpio, sw.gpio) == (2, 3, 4)
    assert sw.levels == [(True, 0), (False, 0)]
    part.update({'step': 'ccw'})
    assert dt.levels[1] == (False, 0) and clk.levels[1] == (False, 12_500_000)
    part.update({'pressed': False})
    assert sw.levels[-1] == (True, 0)
    with pytest.raises(ValueError, match='pressed takes true or false'):
        part.update({'pressed': 1})
    part.detach()
    assert clk.stopped and dt.stopped and sw.stopped
    with pytest.raises(ValueError, match='attaches with dt_pin, pressed'):
        Part('ky-040', {'sw_pin': 4, 'pressed': False}, FakeHost(pin=2))
    no_sw = FakeHost(pin=2)
    Part('ky-040', {'dt_pin': 3, 'pressed': False}, no_sw).update({'pressed': True})
    assert [len(output.levels) for output in no_sw.outputs] == [1, 1]


def test_keypad_resolves_its_undriven_nodes_on_each_pin_and_key_change():
    host = FakeHost(pin=30)
    rows, columns = [30, 31, 32, 33], [34, 35, 36]
    for gpio in columns:
        host.pins[gpio] = (None, True)
    for gpio in rows:
        host.pins[gpio] = (True, None)
    part = Part('membrane-keypad', {'r2_pin': 31, 'r3_pin': 32, 'r4_pin': 33,
                                    'c1_pin': 34, 'c2_pin': 35, 'c3_pin': 36, 'keys': []}, host)
    assert host.levels == [(34, True), (35, True), (36, True)]
    part.update({'keys': [[1, 1]]})
    host.levels.clear()
    host.drive(31, (False, None))
    assert host.levels == [(34, True), (35, False), (36, True)]
    host.drive(31, (None, None))
    assert host.levels[-4:] == [(31, True), (34, True), (35, True), (36, True)]
    part.update({'keys': [[1, 1], [1, 2]]})
    host.drive(35, (False, None))
    assert host.levels[-3:] == [(31, False), (34, True), (36, False)]
    part.detach()
    assert host.watches == []


def test_keypad_checks_its_fields_and_keys():
    with pytest.raises(ValueError, match='attaches with keys'):
        Part('membrane-keypad', {'r2_pin': 31}, FakeHost(pin=30))
    with pytest.raises(ValueError, match='two nodes share a pin'):
        Part('membrane-keypad', {'c1_pin': 30, 'keys': []}, FakeHost(pin=30))
    part = Part('membrane-keypad', {'keys': []}, FakeHost(pin=30))
    with pytest.raises(ValueError, match='no key at row 4'):
        part.update({'keys': [[4, 0]]})


def test_gps_sends_a_cycle_at_its_interval_one_frame_per_byte_and_pulses_fix():
    host = FakeHost(pin=19)
    part = Part('pa1616s', {'rx_pin': 18, 'fix_pin': 4, 'fix': False}, host)
    uart, fix = host.uarts[0], host.outputs[0]
    assert uart.pins == (19, 18) and fix.levels == [(False, 0)]
    host.advance(1000)
    assert uart.delivered == [] and fix.levels[1:] == [(True, 1_000_000_000), (False, 1_200_000_000)]
    host.advance(2)
    assert uart.delivered == [(ord('$'), 1_000_000_000 + BYTE_NS)]
    # A byte with no receiver listening is lost; one at another baud rejects the firmware.
    uart.framing = None
    host.advance(10)
    assert len(uart.delivered) == 1
    uart.framing = {**FRAMING, 'baud': 115200}
    with pytest.raises(ValueError, match='receives at'):
        host.advance(2)
    part.detach()
    assert uart.stopped and fix.stopped and host.timers[0].stopped


def test_gps_answers_a_command_behind_the_bytes_it_is_sending():
    host = FakeHost(pin=19)
    part = Part('pa1616s', {'rx_pin': 18}, host)
    uart = host.uarts[0]
    for byte in nmea_wrap('PMTK605').encode('ascii'):
        uart.on_byte(byte, FRAMING)
    host.advance(100)
    reply = bytes(byte for byte, _ in uart.delivered)
    assert reply.startswith(b'$PMTK705,') and uart.delivered[0][1] == BYTE_NS
    with pytest.raises(ValueError, match="UART sends at"):
        uart.on_byte(0x24, {**FRAMING, 'parity': 'even'})
    part.update({'fix': True, 'latitude': 40.0})
    with pytest.raises(ValueError, match='latitude must be a finite number'):
        part.update({'latitude': float('nan')})


def hm10_fields(**fields) -> dict:
    direct = {'series': 0, 'high': 3.3, 'load': None}
    return {'tx_pin': 19, 'rx_pin': 18, 'rx_net': direct, 'pads': {'UART_CTS': {'gpio': 22, **direct}},
            'identity': '00112233ABCD', 'retained': {}, 'partner': PARTNER, 'pressed': [], **fields}


def test_hm10_answers_on_its_uart_reports_its_element_state_and_takes_actions():
    host = FakeHost(pin=300)
    part = Part('hm10', hm10_fields(), host)
    uart = host.uarts[0]
    assert uart.pins == (19, 18) and host.watches[0][0] == [22]
    assert host.state['connected'] is False and host.state['startupConfiguration'].startswith('{"role":0')
    for byte in b'AT':
        uart.on_byte(byte, FRAMING)
    host.advance(100)
    assert bytes(byte for byte, _ in uart.delivered) == b'OK'
    part.update({'action': 'remoteOn', 'partner': PARTNER})
    part.update({'action': 'connect', 'partner': PARTNER})
    assert host.state['connected'] is True
    with pytest.raises(ValueError, match='an action takes action, partner and data'):
        part.update({'action': 'disconnect'})
    part.detach()
    assert uart.stopped and host.timers[0].stopped and host.watches == []


def test_hm10_rejects_a_5_v_pad_drive_and_holds_buttons_pressed_before_attach():
    host = FakeHost(pin=300)
    Part('hm10', hm10_fields(retained={'flow': 1}, pads={'UART_CTS': {'gpio': 22, 'series': 0, 'high': 5, 'load': None}}), host)
    with pytest.raises(ValueError, match=r'UART_CTS exceeds raw 3.3V pin envelope \(5.0V\)'):
        host.drive(22, (True, None))
    host = FakeHost(pin=300)
    Part('hm10', hm10_fields(pressed=['resetDown', 'keyDown']), host)
    assert host.state['resetHeld'] is True and host.state['keyHeld'] is True
    with pytest.raises(ValueError, match='rx_net comes exactly with rx_pin'):
        Part('hm10', hm10_fields(rx_pin=None), FakeHost(pin=300))


UNO_RX_NET = {'series': 1000, 'high': 5, 'load': {'voltage': 0, 'resistance': 2000}}


def test_hm10_on_plain_gpios_samples_the_firmware_frames_and_drives_its_own():
    host = FakeHost(pin=300, uarts=False)
    part = Part('hm10', hm10_fields(tx_pin=8, rx_pin=7, rx_net=UNO_RX_NET, pads={}), host)
    tx = host.outputs[0]
    assert tx.gpio == 8 and tx.levels == [(True, 0)]
    host.drive(7, (True, None))
    for byte in b'AT':
        host.send_frame(7, encode('test', byte, FRAMING), 9600)
    host.advance(100)
    assert wire_bytes(tx, FRAMING) == b'OK' and host.state['uartRxHex'] == '4154'
    part.detach()
    assert tx.stopped and host.watches == []


def test_hm10_on_plain_gpios_samples_at_its_own_parity():
    host = FakeHost(pin=300, uarts=False)
    Part('hm10', hm10_fields(tx_pin=8, rx_pin=7, rx_net=UNO_RX_NET, pads={}, retained={'parity': 1}), host)
    even = {**FRAMING, 'parity': 'even'}
    host.drive(7, (True, None))
    host.send_frame(7, encode('test', ord('A'), even), 9600)
    assert host.state['uartRxHex'] == '41'
    with pytest.raises(ValueError, match='hm10: UART frame has a parity error'):
        host.send_frame(7, encode('test', ord('T'), {**FRAMING, 'parity': 'odd'}), 9600)


def test_gps_on_plain_gpios_drives_each_frame_from_its_start_and_answers_sampled_commands():
    host = FakeHost(pin=8, uarts=False)
    part = Part('pa1616s', {'rx_pin': 7}, host)
    tx = host.outputs[0]
    host.advance(1001)
    assert tx.levels[1] == (False, 1_000_000_000) and wire_bytes(tx, FRAMING) == b'$'
    host.drive(7, (True, None))
    for byte in nmea_wrap('PMTK605').encode('ascii'):
        host.send_frame(7, encode('test', byte, FRAMING), 9600)
    host.advance(1000)
    assert b'\r\n$PMTK705,' in wire_bytes(tx, FRAMING)
    part.detach()
    assert tx.stopped and host.watches == []
