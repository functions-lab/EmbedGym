"""Unit tests for embedgym_parts/i2c/hmc5883l.py (HMC5883LSlave): the cases of
hmc5883l-protocol.test.ts over the picsimlab I2C event encoding, with the
worker's timer contract in place of the AVR part's clock events."""
from __future__ import annotations

import pytest

from embedgym_parts.i2c.hmc5883l import HMC5883LSlave
from i2c_bus import MS_NS, read_regs, write_regs


class Harness:
    """The worker's side of the slave: a virtual clock, the DRDY level log and
    the one timer the slave arms through on_measurement_scheduled."""

    def __init__(self) -> None:
        self.now = 0
        self.due: int | None = None
        self.pins: list[tuple[float, bool]] = [(0, True)]
        self.dev = HMC5883LSlave(lambda: self.now, self._drdy, self._schedule)
        self.dev.power_on()

    def _drdy(self, asserted: bool) -> None:
        self.pins.append((self.now / MS_NS, not asserted))

    def _schedule(self, due_ns: int) -> None:
        assert due_ns >= self.now
        self.due = due_ns

    def advance(self, ms: float) -> None:
        target = self.now + round(ms * MS_NS)
        while self.due is not None and self.due <= target:
            self.now = self.due
            self.due = None
            self.dev.tick(self.now)
        self.now = target

    def field(self, x: float | None = None, y: float | None = None, z: float | None = None) -> None:
        self.dev.update(magnetic_x=x, magnetic_y=y, magnetic_z=z)


def write(h: Harness, reg: int, *values: int) -> None:
    write_regs(h.dev, reg, *values)


def read(h: Harness, reg: int, count: int = 1) -> list[int]:
    return read_regs(h.dev, reg, count)


def axes(h: Harness) -> list[int]:
    b = read(h, 3, 6)

    def signed(i: int) -> int:
        value = (b[i] << 8) | b[i + 1]
        return value - 0x10000 if value & 0x8000 else value

    return [signed(0), signed(4), signed(2)]


def test_power_up_defaults_and_one_measurement_after_analog_startup():
    h = Harness()
    assert h.dev.addr == 0x1E
    assert read(h, 0, 3) == [0x10, 0x20, 1]
    assert read(h, 10, 3) == [72, 52, 51]
    write(h, 2, 2)
    write(h, 2, 1)
    h.advance(55.999)
    assert read(h, 9) == [0]
    h.advance(0.001)
    assert read(h, 9) == [1]
    assert axes(h) == [327, -218, 109]
    assert read(h, 2) == [2]
    assert read(h, 9) == [2]
    h.field(x=0.6)
    h.advance(3000)
    assert axes(h)[0] == 327


@pytest.mark.parametrize('rate', range(7))
def test_single_mode_independent_of_rate_and_hs_survives_auto_idle(rate):
    h = Harness()
    h.advance(100)
    axes(h)
    write(h, 0, rate << 2)
    write(h, 2, 0x81)
    h.advance(5.999)
    assert read(h, 9) == [0]
    h.advance(0.001)
    assert read(h, 9) == [1]
    assert axes(h) == [327, -218, 109]
    assert read(h, 2) == [0x82]


@pytest.mark.parametrize('rate,hz', list(enumerate([0.75, 1.5, 3, 7.5, 15, 30, 75])))
def test_continuous_rate_paces_and_stops_in_both_idle_modes(rate, hz):
    h = Harness()
    h.advance(100)
    axes(h)
    write(h, 0, rate << 2)
    write(h, 2, 0)
    h.advance(2000 / hz - 0.01)
    assert read(h, 9) == [0]
    h.advance(0.02)
    assert read(h, 9) == [1]
    assert axes(h) == [327, -218, 109]
    h.field(y=0.2)
    h.advance(1000 / hz)
    assert axes(h)[1] == 218
    for idle in (2, 3):
        write(h, 2, idle)
        h.field(y=0)
        h.advance(4000)
        assert axes(h)[1] == 218


@pytest.mark.parametrize('gain,scale', list(enumerate([1370, 1090, 820, 660, 440, 390, 330, 230])))
def test_gain_applies_from_second_conversion_and_self_test_bias(gain, scale):
    h = Harness()
    h.advance(100)
    axes(h)
    write(h, 1, gain << 5)
    write(h, 2, 1)
    h.advance(6)
    assert axes(h) == [327, -218, 109]
    write(h, 2, 1)
    h.advance(6)
    assert axes(h) == [round(0.3 * scale), round(-0.2 * scale), round(0.1 * scale)]
    for bias in (1, 2):
        write(h, 0, 0x70 | bias)
        write(h, 2, 1)
        h.advance(6)
        sign = 1 if bias == 1 else -1
        assert axes(h) == [round(sign * 1.16 * scale), round(sign * 1.16 * scale), round(sign * 1.08 * scale)]


@pytest.mark.parametrize('average', range(4))
def test_averages_1_2_4_8_samples(average):
    h = Harness()
    h.advance(100)
    axes(h)
    write(h, 0, 0x10 | (average << 5))
    assert read(h, 0) == [0x10 | (average << 5)]
    write(h, 2, 1)
    h.field(x=0)
    h.advance(3.01)
    h.field(x=0.4)
    h.advance(3)
    assert axes(h)[0] == (436 if average == 0 else 218)


@pytest.mark.parametrize('reg,value', [(0, 0x10), (1, 0x40), (2, 0)])
def test_configuration_write_restarts_continuous_timing_with_one_old_gain_conversion(reg, value):
    h = Harness()
    h.advance(100)
    axes(h)
    write(h, 2, 0)
    h.advance(100)
    write(h, reg, value)
    h.advance(133.32)
    assert read(h, 9) == [0]
    h.advance(0.02)
    assert read(h, 9) == [1]
    assert axes(h)[0] == 327
    h.advance(66.67)
    assert axes(h)[0] == (246 if reg == 1 else 327)


def test_lock_on_partial_or_mode_read_unlocks_on_all_six_bytes_or_mode_cra_change():
    h = Harness()
    h.advance(100)
    write(h, 2, 0)
    h.advance(140)
    read(h, 3)
    assert read(h, 9) == [2]
    h.field(x=0.6)
    h.advance(140)
    assert axes(h)[0] == 327
    h.advance(70)
    assert axes(h)[0] == 654
    read(h, 2)
    assert read(h, 9)[0] & 2 == 2
    h.field(x=0)
    h.advance(140)
    assert read(h, 3, 2) == [2, 142]
    write(h, 0, 0x30)
    assert read(h, 9)[0] & 2 == 0
    read(h, 2)
    write(h, 2, 1)
    assert read(h, 9)[0] & 2 == 0
    h.advance(6)
    assert axes(h)[0] == 0


def test_drdy_pulses_low_for_250us_independently_of_status_read():
    h = Harness()
    h.advance(56)
    assert h.pins == [(0, True), (56, False)]
    assert read(h, 9) == [1]
    h.advance(0.249)
    assert h.pins[-1][1] is False
    h.advance(0.001)
    assert h.pins[-1] == (56.25, True)
    axes(h)
    assert read(h, 9) == [0]


def test_overflow_per_axis_recovers_including_bias_acquisition_overflow():
    h = Harness()
    h.field(x=3, z=-3)
    h.advance(56)
    assert axes(h) == [-4096, -218, -4096]
    h.field(x=0.3, z=0.1)
    write(h, 2, 1)
    h.advance(6)
    assert axes(h) == [327, -218, 109]
    h.field(x=1)
    write(h, 0, 0x11)
    write(h, 2, 1)
    h.advance(6)
    assert axes(h) == [-4096, 1264, 1177]
    h.field(x=-2048 / 1090)
    write(h, 2, 1)
    h.advance(6)
    assert axes(h) == [1264, 1264, 1177]


def test_status_stays_clear_250us_after_a_complete_read():
    h = Harness()
    h.advance(100)
    axes(h)
    write(h, 0, 0x18)
    write(h, 2, 0)
    h.advance(39.9)
    axes(h)
    h.advance(0.1)
    assert read(h, 9) == [0]
    h.advance(0.15)
    assert read(h, 9) == [1]


def test_pointer_wraps_data_to_x_and_ids_to_cra_through_stop_and_repeated_start():
    h = Harness()
    h.advance(56)
    assert read(h, 3, 12) == [1, 71, 0, 109, 255, 38, 1, 71, 0, 109, 255, 38]
    assert read(h, 10, 4) == [72, 52, 51, 0x10]


def test_ignored_writes_undefined_reads_and_reserved_rate_bias_rejected():
    h = Harness()
    write(h, 0, 0x90)
    assert read(h, 0) == [0x10]
    write(h, 1, 0x3F)
    assert read(h, 1) == [0x20]
    write(h, 2, 0x7E)
    assert read(h, 2) == [2]
    for reg in (3, 9, 10, 13, 255):
        write(h, reg, 255)
    assert read(h, 10, 3) == [72, 52, 51]
    assert read(h, 13, 2) == [0, 0]
    with pytest.raises(ValueError, match='reserved output rate'):
        write(h, 0, 0x1C)
    with pytest.raises(ValueError, match='reserved output rate'):
        write(h, 0, 0x13)


@pytest.mark.parametrize('value', [float('nan'), float('inf'), 100.5, -101])
def test_field_outside_range_rejected(value):
    h = Harness()
    with pytest.raises(ValueError, match='magneticY must be finite'):
        h.field(y=value)
    assert h.dev.field == [0.3, -0.2, 0.1]


def test_restart_keeps_the_pending_drdy_release():
    h = Harness()
    h.advance(56.1)
    write(h, 2, 2)
    h.advance(0.15)
    assert h.pins == [(0, True), (56, False), (56.25, True)]
