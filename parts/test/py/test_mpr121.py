"""Unit tests for embedgym_parts/i2c/mpr121.py (MPR121Slave): the cases of
mpr121-protocol.test.ts over the picsimlab I2C event encoding, with the
worker's timer contract in place of the AVR part's clock events, plus the
worker's pin split (canvas drives, MCU-bound electrodes, INT)."""
from __future__ import annotations

import pytest

from embedgym_parts.i2c.mpr121 import GPIO_PINS, MPR121Slave
from embedgym_parts.mcu_pins import McuPins
from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_READ, I2C_START_RECV, I2C_START_SEND
from i2c_bus import MS_NS, write_event


class Harness:
    """The host's side of the slave: a virtual clock, the one timer it arms,
    and its pins through embedgym_parts/mcu_pins.py: the canvas drives and, for INT
    (GPIO 4) and electrodes on MCU GPIOs (GPIO 20 + N), the firmware's drives
    and the levels it reads."""

    def __init__(self, powered: bool = True, bound: dict | None = None, loads: dict | None = None,
                 parts: tuple = (), int_bound: bool = False, addr: int = 0x5A) -> None:
        self.now = 0
        self.due: int | None = None
        self.drives: dict = {}
        self.edges: list = []
        self.levels: dict = {}
        self.firmware: dict = {}
        self.interrupts: list = []
        self.ticks = 0
        bound = bound or {}
        loads = loads or {}
        electrodes = {pin: {'series': bound.get(pin), 'load': loads.get(pin), 'parts': pin in parts} for pin in GPIO_PINS}
        fields = {'powered': powered, 'electrodes': electrodes,
                  **{f'e{pin}_pin': 20 + int(pin) for pin in bound}, **({'int_pin': 4} if int_bound else {})}
        self.gpio_pins = {20 + int(pin): pin for pin in bound}
        self.pins_changed = None
        self.dev = MPR121Slave(addr, lambda: self.now, self._schedule)
        self.dev.attach_circuit(fields)
        McuPins(self.dev, fields, self, self._pin_drive)
        self.dev.power_on()

    def set_level(self, gpio: int, high: bool) -> None:
        if gpio == 4:
            self.interrupts.append(not high)
        else:
            self.levels[self.gpio_pins[gpio]] = high

    def mcu_pin(self, gpio: int) -> tuple:
        return self.firmware.get(self.gpio_pins[gpio]), None

    def watch(self, gpios: list, changed):
        self.pins_changed = changed
        return lambda: None

    def _pin_drive(self, pin: str, drive) -> None:
        self.drives[pin] = drive
        self.edges.append((pin, None if drive is None else drive['voltage'], self.now / MS_NS))

    def _schedule(self, due_ns: int) -> None:
        assert due_ns >= self.now
        self.due = due_ns

    def advance(self, ms: float) -> None:
        target = self.now + round(ms * MS_NS)
        while self.due is not None and self.due <= target:
            self.now = self.due
            self.due = None
            self.ticks += 1
            self.dev.tick(self.now)
        self.now = target

    def write(self, reg: int, *data: int) -> None:
        assert self.dev.handle_event(I2C_START_SEND) == 0
        assert self.dev.handle_event(write_event(reg)) == 0
        for byte in data:
            assert self.dev.handle_event(write_event(byte)) == 0
        self.dev.handle_event(I2C_FINISH)

    def read(self, reg: int, count: int = 1) -> list[int]:
        assert self.dev.handle_event(I2C_START_SEND) == 0
        assert self.dev.handle_event(write_event(reg)) == 0
        self.dev.handle_event(I2C_FINISH)
        assert self.dev.handle_event(I2C_START_RECV) == 0
        out = [self.dev.handle_event(I2C_READ) for _ in range(count)]
        self.dev.handle_event(I2C_FINISH)
        return out

    def word(self, reg: int) -> int:
        low, high = self.read(reg, 2)
        return low | high << 8

    def run(self, ecr: int = 0xC1) -> None:
        self.write(0x5D, 0x20)
        self.write(0x41, 12, 6)
        self.write(0x5E, ecr)
        self.advance(8)

    def filtered(self, channel: int = 0) -> int:
        return self.word(4 + 2 * channel)

    def set(self, **values) -> None:
        self.dev.update(values)

    def press(self, electrode: int, pressed: bool = True) -> None:
        state = list(self.dev.inputs['pressed'])
        state[electrode] = pressed
        self.dev.update({'pressed': state})


def test_reset_map_pointer_retention_and_wrap():
    h = Harness()
    assert h.read(0, 0x80) == [0x10 if reg == 0x5C else 0x24 if reg == 0x5D else 0 for reg in range(128)]
    h.write(0x7F, 180)
    assert h.read(0x7F, 2) == [180, 0]
    h.write(0x80, 0x63)
    assert h.read(0x5C, 3) == [0x10, 0x24, 0]


def test_physical_units_and_baseline():
    h = Harness()
    h.run()
    assert h.filtered() == 165
    assert h.read(0x1E)[0] << 2 == 164


def test_individual_cdc_cdt_and_saturation():
    h = Harness()
    h.write(0x5F, 32)
    h.write(0x6C, 2)
    h.run()
    assert h.filtered() == 661
    h.write(0x5E, 0)
    h.write(0x5F, 63)
    h.write(0x6C, 7)
    h.run()
    assert h.filtered() == 1023


@pytest.mark.parametrize('cl, expected', [(0, 400), (1, 400), (2, 160), (3, 164)])
def test_baseline_initialization_and_lock(cl, expected):
    h = Harness()
    h.write(0x1E, 100)
    h.run((cl << 6) | 1)
    assert h.read(0x1E)[0] << 2 == expected
    h.set(capacitance0=10)
    h.advance(8)
    assert h.read(0x1E)[0] << 2 == expected


@pytest.mark.parametrize('mode, expected', [(1, 82), (2, 41), (3, 13)])
def test_proximity_sums_capacitance(mode, expected):
    h = Harness()
    h.run(0xC0 | (mode << 4))
    assert h.filtered(12) == expected


@pytest.mark.parametrize('sfi', [0, 1, 2, 3])
def test_sfi_averages_scans(sfi):
    h = Harness()
    h.write(0x5D, 0x20 | (sfi << 3))
    h.write(0x5E, 0xC1)
    count = (4, 6, 10, 18)[sfi]
    h.advance(count - 2)
    assert h.filtered() == 0
    h.advance(2)
    assert h.filtered() == 165


@pytest.mark.parametrize('esi', range(8))
def test_esi_period(esi):
    h = Harness()
    h.write(0x5D, 0x20 | esi)
    h.write(0x5E, 0xC1)
    h.advance(3 * 2 ** esi - 0.001)
    assert h.filtered() == 0
    h.advance(1)
    assert h.filtered() == 165


def test_touch_raises_canvas_interrupt_and_addressed_start_clears_it():
    h = Harness()
    h.run()
    assert h.drives['INT'] is None
    h.press(0)
    h.advance(100)
    assert h.filtered() == 99 and h.word(0) == 1
    h.press(0, False)
    h.advance(8)
    assert h.drives['INT']['voltage'] == 0
    h.dev.handle_event(I2C_START_SEND)
    assert h.drives['INT'] is None


def test_bound_interrupt_goes_to_the_worker_pin():
    h = Harness(int_bound=True)
    assert 'INT' not in h.drives and h.interrupts == [False]
    h.run()
    h.press(0)
    h.advance(8)
    assert h.interrupts == [False, True]
    h.read(0)
    assert h.interrupts == [False, True, False]


def test_overcurrent_stops_and_rejects_run_until_cleared():
    h = Harness()
    h.run()
    h.set(rextOvercurrent=True)
    h.advance(1)
    assert h.word(0) == 0x8000 and h.read(0x5E)[0] == 0xC0 and h.filtered() == 0
    h.write(0x5E, 0xC1)
    assert h.read(0x5E)[0] == 0xC0
    h.set(rextOvercurrent=False)
    h.write(1, 0x80)
    h.run()
    assert h.filtered() == 165


def test_mid_scan_overcurrent_trips_at_the_next_conversion():
    h = Harness()
    h.run()
    h.advance(0.0025)
    h.set(rextOvercurrent=True)
    h.advance(0.01)
    assert h.edges[-1] == ('INT', 0, 8.003)
    assert h.word(0) == 0x8000


def test_conversions_before_an_input_change_read_the_old_input():
    h = Harness()
    h.run()
    h.advance(0.0025)
    h.press(0)
    h.advance(0.01)
    assert h.dev._scan['samples'][0] == [165, 165, 99, 99, 99, 99]


def test_a_scan_costs_one_timer_wakeup():
    h = Harness()
    h.run(0x8C)
    h.ticks = 0
    h.advance(100)
    assert h.ticks == 200


@pytest.mark.parametrize('bva', [0, 1, 2, 3])
def test_autoconfig_bva(bva):
    h = Harness()
    h.write(0x1E, 20)
    h.write(0x7B, 1 | (bva << 2))
    h.write(0x7D, 200, 130, 180)
    h.run(0x41)
    h.advance(80)
    assert h.read(0x5F)[0] > 0 and 520 <= h.filtered() <= 800 and h.read(2, 2) == [0, 0]
    baseline = h.read(0x1E)[0] << 2
    if bva == 0:
        assert baseline == 80
    elif bva == 1:
        assert baseline == 0
    elif bva == 2:
        assert baseline % 8 == 0
    elif bva == 3:
        assert abs(baseline - h.filtered()) < 4


def test_failed_autoconfig_flags_and_fault_interrupt():
    h = Harness()
    h.write(0x7B, 0x0F)
    h.write(0x7C, 7)
    h.write(0x7D, 200, 130, 180)
    h.set(capacitance0=100000)
    h.run()
    h.advance(120)
    assert h.read(2, 2) == [1, 0xC0]
    h.advance(60)
    assert h.drives['INT']['voltage'] == 0
    h.set(capacitance0=15)
    h.advance(100)
    assert h.read(2)[0] == 0


def test_rejects_reserved_registers_and_bad_reset():
    h = Harness()
    with pytest.raises(ValueError, match='reserved'):
        h.read(0x80)
    with pytest.raises(ValueError, match='read-only'):
        h.write(4, 0)
    with pytest.raises(ValueError, match='0x63'):
        h.write(0x80, 0)
    with pytest.raises(ValueError, match='address'):
        MPR121Slave(0x60, lambda: 0)


def test_unpowered_nacks_and_drives_nothing():
    h = Harness(powered=False)
    assert h.dev.handle_event(I2C_START_SEND) == 1
    assert h.dev.handle_event(I2C_START_RECV) == 1
    assert all(h.drives[pin] is None for pin in GPIO_PINS) and h.drives['INT'] is None


def test_reset_drives_every_electrode():
    h = Harness(bound={'5': 0})
    assert set(h.drives) == {'INT', *GPIO_PINS} - {'5'}
    assert all(drive is None for drive in h.drives.values())


def test_inputs_are_validated_atomically():
    h = Harness()
    with pytest.raises(ValueError, match='capacitance'):
        h.set(capacitance1=20, capacitance0=0)
    assert h.dev.inputs['capacitance'][1] == 15
    with pytest.raises(ValueError, match='unknown'):
        h.set(temperature=3)
    with pytest.raises(ValueError, match='invalid'):
        h.set(pressed=[True])


def test_mcu_pins_reject_mismatched_bindings():
    dev = MPR121Slave(0x5A, lambda: 0)
    electrodes = {pin: {'series': None, 'load': None, 'parts': False} for pin in GPIO_PINS}
    with pytest.raises(ValueError, match='electrode 4'):
        McuPins(dev, {'powered': True, 'electrodes': electrodes, 'e4_pin': 5}, None, None)
    with pytest.raises(RuntimeError, match='attach_circuit'):
        dev.power_on()


@pytest.mark.parametrize('control', [0, 1])
def test_plain_gpio_input_and_output_latch(control):
    h = Harness(loads={'4': {'voltage': 3.3, 'resistance': 10}})
    h.write(0x73, control)
    h.write(0x77, 1)
    h.write(0x75, 0)
    assert h.read(0x75)[0] == 1 and h.word(0) == 16
    h.write(0x76, 1)
    assert h.drives['4']['voltage'] == 0
    h.write(0x78, 1)
    assert h.read(0x78)[0] == 1
    h.write(0x79, 1)
    assert h.read(0x79)[0] == 0


def test_floating_input_read_is_explicit_and_canvas_parts_are_unmodeled():
    h = Harness(parts=('5',))
    h.write(0x77, 1)
    with pytest.raises(ValueError, match='floating'):
        h.read(0x75)
    h.write(0x77, 2)
    with pytest.raises(ValueError, match='canvas parts'):
        h.read(0x75)


@pytest.mark.parametrize('channel', range(8))
def test_pwm_waveform(channel):
    h = Harness()
    bit = 1 << channel
    pad = str(channel + 4)
    h.write(0x76, bit)
    h.write(0x77, bit)
    h.write(0x75, bit)
    h.write(0x81 + (channel >> 1), 8 << ((channel & 1) * 4))
    h.advance(20)
    waveform = [edge for edge in h.edges if edge[0] == pad and edge[2] > 0]
    assert (pad, 0, 4) in waveform and (pad, 3.3, 8) in waveform
    h.write(0x81 + (channel >> 1), 0)
    assert h.drives[pad]['voltage'] == 0
    h.advance(10)
    assert h.drives[pad]['voltage'] == 3.3


def test_measurement_defers_pwm():
    h = Harness()
    h.write(0x76, 1)
    h.write(0x77, 1)
    h.write(0x75, 1)
    h.write(0x81, 1)
    h.write(0x5C, 0xD0)
    h.write(0x5D, 0xE0)
    h.write(0x5E, 0xC1)
    h.advance(0.6)
    assert h.drives['4']['voltage'] == 3.3
    h.advance(1.7)
    assert h.drives['4']['voltage'] == 0


def test_bound_electrode_levels_follow_the_net_while_the_firmware_reads():
    h = Harness(bound={'4': 10000, '6': 0}, loads={'4': {'voltage': 0, 'resistance': 100000},
                                                   '6': {'voltage': 3.3, 'resistance': 10000}})
    assert h.levels == {'4': False, '6': True}
    assert '4' not in h.drives and '6' not in h.drives
    h.write(0x76, 0x05)
    h.write(0x77, 0x05)
    h.write(0x75, 0x01)
    assert h.levels == {'4': True, '6': False}
    # Low-side open drain releases to the pull-up.
    h.write(0x74, 0x04)
    h.write(0x78, 0x04)
    assert h.levels['6'] is True
    h.firmware['6'] = False
    h.pins_changed()
    h.firmware.pop('6')
    h.levels.pop('6')
    h.pins_changed()
    assert h.levels['6'] is True


def test_bound_electrode_input_reads_the_firmware_drive_through_the_series_resistor():
    h = Harness(bound={'4': 10000}, loads={'4': {'voltage': 0, 'resistance': 100000}})
    h.write(0x77, 1)
    assert h.read(0x75)[0] & 1 == 0
    h.firmware['4'] = True
    h.pins_changed()
    assert h.read(0x75)[0] & 1 == 1
