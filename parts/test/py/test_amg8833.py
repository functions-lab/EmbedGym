"""Unit tests for embedgym_parts/i2c/amg8833.py (AMG8833Slave): the cases of
amg8833-protocol.test.ts over the picsimlab I2C event encoding, with the
worker's timer contract in place of the AVR part's clock events."""
from __future__ import annotations

import math

import pytest

from embedgym_parts.i2c.amg8833 import AMG8833Slave
from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_READ, I2C_START_RECV
from i2c_bus import MS_NS, read_regs, write_regs


class Harness:
    """The worker's side of the slave: a virtual clock, the INT level log and
    the one timer the slave arms through on_conversion_scheduled."""

    def __init__(self, addr: int = 0x69) -> None:
        self.now = 0
        self.due: int | None = None
        self.pins: list[tuple[float, bool]] = [(0, True)]
        self.dev = AMG8833Slave(addr, lambda: self.now, self._int, self._schedule)
        self.dev.power_on()

    def _int(self, asserted: bool) -> None:
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

    def set(self, **values) -> None:
        self.dev.update(values)

    @property
    def int_high(self) -> bool:
        return self.pins[-1][1]


def write(h: Harness, reg: int, *values: int) -> None:
    write_regs(h.dev, reg, *values)


def read(h: Harness, reg: int, count: int = 1) -> list[int]:
    return read_regs(h.dev, reg, count)


def signed(h: Harness, reg: int) -> int:
    b = read(h, reg, 2)
    n = b[0] | (b[1] << 8)
    return n - 4096 if n & 0x800 else n


def levels(h: Harness, high: int, low: int, hysteresis: int) -> None:
    write(h, 8, high & 255, (high >> 8) & 15, low & 255, (low >> 8) & 15, hysteresis & 255, (hysteresis >> 8) & 15)


@pytest.mark.parametrize('addr', [0x68, 0x69])
def test_jumper_address_and_independent_signed_thermistor_and_pixels(addr):
    h = Harness(addr)
    assert h.dev.addr == addr
    assert read(h, 0) == [0] and read(h, 2, 3) == [0, 0, 0]
    h.set(thermistorTemperature=-12.0625)
    for i in range(64):
        h.set(**{f'pixel{i}': (i - 32) * 0.25})
    h.advance(99.999)
    assert signed(h, 0x80) == 0
    h.advance(0.001)
    assert read(h, 0x0E, 2) == [193, 8]
    assert [signed(h, 0x80 + 2 * i) for i in range(64)] == [i - 32 for i in range(64)]
    assert read(h, 0xFF, 2) == [0, 0]


def test_other_address_is_rejected():
    with pytest.raises(ValueError, match='address'):
        AMG8833Slave(0x6A, lambda: 0)


def test_full_read_is_coherent_when_a_frame_completes_during_it():
    h = Harness()
    h.advance(100)
    write(h, 0x80)
    h.dev.handle_event(I2C_START_RECV)
    first = h.dev.handle_event(I2C_READ)
    h.set(pixel0=30, pixel63=40)
    h.advance(100)
    remaining = [h.dev.handle_event(I2C_READ) for _ in range(127)]
    h.dev.handle_event(I2C_FINISH)
    assert first == 100 and remaining[125] == 100
    assert signed(h, 0x80) == 120 and signed(h, 0xFE) == 160


def test_paces_one_and_ten_fps_and_cancels_old_deadlines():
    h = Harness()
    h.advance(100)
    h.set(pixel0=30)
    write(h, 2, 1)
    h.advance(999.99)
    assert signed(h, 0x80) == 100
    h.advance(0.01)
    assert signed(h, 0x80) == 120
    h.set(pixel0=40)
    write(h, 2, 0)
    h.advance(100)
    assert signed(h, 0x80) == 160


@pytest.mark.parametrize('mode,period', [(0x20, 60000), (0x21, 10000)])
def test_standby_modes_pace_independently_of_fpsc(mode, period):
    h = Harness()
    h.advance(200)
    levels(h, 120, 40, 100)
    write(h, 3, 3)
    write(h, 2, 1)
    write(h, 0, mode)
    h.set(pixel63=35)
    h.advance(period - 0.001)
    assert signed(h, 0xFE) == 100
    h.advance(0.001)
    assert signed(h, 0xFE) == 140 and read(h, 0x17) == [128]
    assert not h.int_high
    write(h, 0, 0)
    h.set(pixel63=25)
    h.advance(1000)
    assert signed(h, 0xFE) == 100


def test_sleep_ignores_writes_rejects_reads_and_enforces_wake_delays():
    h = Harness()
    h.advance(200)
    write(h, 2, 1)
    write(h, 0, 0x10)
    write(h, 2, 0)
    write(h, 1, 0x3F)
    h.set(pixel0=40)
    h.advance(10000)
    with pytest.raises(ValueError, match='sleep'):
        read(h, 0x80)
    write(h, 0, 0)
    assert read(h, 2) == [1] and signed(h, 0x80) == 100
    with pytest.raises(ValueError, match='50 ms'):
        write(h, 1, 0x3F)
    h.advance(50)
    write(h, 1, 0x3F)
    with pytest.raises(ValueError, match='2 ms'):
        write(h, 1, 0x30)
    h.advance(2)
    write(h, 1, 0x30)
    h.advance(1000)
    assert signed(h, 0x80) == 160


def test_wake_requires_a_fresh_initial_reset():
    h = Harness()
    write(h, 1, 0x3F)
    h.advance(100)
    write(h, 0, 0x10)
    h.advance(100)
    write(h, 0, 0)
    with pytest.raises(ValueError, match='initial reset'):
        write(h, 1, 0x30)
    with pytest.raises(ValueError, match='50 ms'):
        write(h, 1, 0x3F)
    h.advance(50)
    with pytest.raises(ValueError, match='initial reset'):
        write(h, 1, 0x30)
    write(h, 1, 0x3F)
    with pytest.raises(ValueError, match='2 ms'):
        write(h, 1, 0x30)
    h.advance(2)
    write(h, 1, 0x30)
    assert read(h, 4) == [0]


def test_moving_average_through_ave_and_the_vendor_sequence():
    h = Harness()
    h.advance(100)
    write(h, 7, 0x20)
    h.set(pixel0=35, thermistorTemperature=30)
    h.advance(100)
    assert signed(h, 0x80) == 120 and read(h, 0x0E, 2) == [224, 1]
    h.advance(100)
    assert signed(h, 0x80) == 140
    for command in (0x50, 0x45, 0x57):
        write(h, 0x1F, command)
    write(h, 7, 0)
    write(h, 0x1F, 0)
    h.set(pixel0=25)
    h.advance(100)
    assert signed(h, 0x80) == 100
    with pytest.raises(ValueError, match='sequence'):
        write(h, 0x1F, 0x45)


def test_resets_retain_configuration_and_only_initial_reset_clears_pixels():
    h = Harness()
    h.advance(200)
    levels(h, 80, 40, 60)
    write(h, 3, 3)
    h.advance(100)
    write(h, 2, 1)
    write(h, 7, 0x20)
    config = read(h, 7, 9)
    write(h, 1, 0x30)
    assert read(h, 4) == [0] and read(h, 0x10, 8) == [0] * 8
    assert signed(h, 0x80) == 100
    write(h, 1, 0x3F)
    assert read(h, 2, 2) == [1, 3] and read(h, 7, 9) == config
    assert signed(h, 0x80) == 0 and read(h, 0x0E, 2) == [144, 1]
    h.advance(1000)
    assert signed(h, 0x80) == 100


@pytest.mark.parametrize('trip,held,recovery', [(35, 28, 25), (5, 20, 25)])
def test_trip_latches_recovers_at_hysteresis_and_int_masks_independently(trip, held, recovery):
    h = Harness()
    h.advance(200)
    levels(h, 120, 40, 100)
    write(h, 5, 6)
    write(h, 3, 3)
    h.set(pixel0=trip)
    h.advance(100)
    assert read(h, 0x10) == [1] and not h.int_high
    h.set(pixel0=held)
    write(h, 5, 2)
    h.advance(100)
    assert read(h, 0x10) == [1]
    h.set(pixel0=recovery)
    write(h, 1, 0x30)
    h.advance(100)
    assert read(h, 4) == [0]
    h.set(pixel0=trip)
    write(h, 3, 2)
    h.advance(100)
    assert read(h, 4) == [2] and h.int_high
    write(h, 3, 3)
    assert not h.int_high
    write(h, 5, 2)
    assert h.int_high


def test_strict_signed_limits_set_each_pixel_bit():
    h = Harness()
    h.advance(200)
    levels(h, 120, -40, 100)
    write(h, 3, 3)
    write(h, 5, 6)
    h.set(pixel0=30, pixel63=-10)
    h.advance(100)
    assert read(h, 4) == [0]
    for i in range(64):
        h.set(**{f'pixel{i}': 31})
        h.advance(100)
        bitmap = read(h, 0x10, 8)
        assert bitmap[i >> 3] & (1 << (i & 7))
        h.set(**{f'pixel{i}': 25})
        h.advance(100)
        write(h, 5, 2)


def test_difference_mode_compares_each_pixel_with_its_previous_frame():
    h = Harness()
    h.advance(200)
    levels(h, 16, -16, 0)
    write(h, 3, 1)
    write(h, 5, 6)
    h.set(pixel0=29, pixel63=21)
    h.advance(100)
    assert read(h, 4) == [0]
    h.set(pixel0=34, pixel63=16)
    h.advance(100)
    assert read(h, 0x10, 8) == [1, 0, 0, 0, 0, 0, 0, 128]
    h.advance(100)
    write(h, 5, 2)
    h.advance(100)
    assert read(h, 4) == [0]


def test_adc_overflow_latches_at_conversion_and_clears_independently():
    h = Harness()
    h.advance(200)
    levels(h, 120, 40, 100)
    write(h, 3, 3)
    write(h, 5, 6)
    h.set(pixelAdcOverflow=True, pixel0=35)
    assert read(h, 4) == [0]
    h.advance(100)
    assert read(h, 4) == [6]
    write(h, 5, 4)
    assert read(h, 4) == [2]
    h.advance(100)
    assert read(h, 4) == [6]
    h.set(pixelAdcOverflow=False)
    write(h, 1, 0x3F)
    assert read(h, 4) == [0]
    h.advance(100)
    assert read(h, 4) == [0]


def test_masks_unused_bits_and_rejects_unsupported_operations():
    h = Harness()
    write(h, 2, 255)
    write(h, 3, 255)
    write(h, 7, 255)
    write(h, 9, 255)
    assert read(h, 2, 2) == [1, 3] and read(h, 7) == [32] and read(h, 9) == [15]
    for reg in (4, 6, 0x0E, 0x10, 0x18, 0x80):
        with pytest.raises(ValueError):
            write(h, reg, 0)
    for reg in (1, 5, 6, 0x18, 0x1F, 0x7F):
        with pytest.raises(ValueError):
            read(h, reg)
    with pytest.raises(ValueError, match='power mode'):
        write(h, 0, 1)
    with pytest.raises(ValueError, match='reset'):
        write(h, 1, 0)


@pytest.mark.parametrize('values', [
    {'pixel64': 25}, {'pixel0': math.nan}, {'pixel0': 512}, {'pixel0': '25'}, {'pixel0': True},
    {'thermistorTemperature': -21}, {'thermistorTemperature': 81}, {'pixelAdcOverflow': 1},
])
def test_rejects_invalid_inputs_without_applying_any(values):
    h = Harness()
    with pytest.raises(ValueError, match='amg8833:'):
        h.dev.update({'pixel1': 30, **values})
    assert h.dev.inputs['pixel1'] == 25


def test_int_drives_only_on_level_changes():
    h = Harness()
    h.advance(200)
    levels(h, 120, 40, 100)
    write(h, 3, 3)
    h.set(pixel0=35)
    h.advance(300)
    assert h.pins == [(0, True), (300, False)]
    write(h, 0, 0x10)
    assert h.pins[-1] == (500, True)


def test_pointer_auto_increments_across_a_burst_write():
    h = Harness()
    write(h, 8, 1, 2, 3, 4, 5, 6)
    assert read(h, 8, 6) == [1, 2, 3, 4, 5, 6]
