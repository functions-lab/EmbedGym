"""Unit tests for embedgym_parts/i2c/ltr390.py (LTR390Slave): the frontend-mirroring cases
over the picsimlab I2C event encoding, then the register-level cases."""
from __future__ import annotations

import unittest

import pytest

from esp32_i2c_slaves import I2C_FINISH, I2C_READ, I2C_START_RECV, I2C_START_SEND
from embedgym_parts.i2c.ltr390 import LTR390Slave
from i2c_bus import MS_NS, i2c_read_seq, i2c_write_seq, read_regs, write_event, write_regs


# ═══════════════════════════════════════════════════════════════════════════════
# LTR390 — mirrors ltr390-protocol.test.ts part 1 over the I2C event encoding,
# with the worker's timer contract in place of the AVR part's 2 ms clock tick.
# ═══════════════════════════════════════════════════════════════════════════════


LTR_INTEGRATION_MS = [400, 200, 100, 50, 25, 12.5]
LTR_RATE_MS = [25, 50, 100, 200, 500, 1000, 2000, 2000]
# Datasheet gain per GAIN code; counts scale by gain / 3 and integration time / 100 ms.
LTR_GAIN_X = [1, 3, 6, 9, 18]



def ltr_read(dev, reg: int, n: int = 1) -> list[int]:
    return read_regs(dev, reg, n)


def ltr_read24(dev, reg: int) -> int:
    """3-byte LSB-first read, the way Adafruit_I2CRegister(…, 3, LSBFIRST) does it."""
    b0, b1, b2 = ltr_read(dev, reg, 3)
    return b0 | (b1 << 8) | (b2 << 16)


def ltr_write_bits(dev, reg: int, bits: int, shift: int, value: int) -> None:
    """Adafruit_I2CRegisterBits::write — read the whole register, splice the field, write it back."""
    mask = ((1 << bits) - 1) << shift
    current = ltr_read(dev, reg)[0]
    write_regs(dev, reg, (current & ~mask) | ((value << shift) & mask))


def ltr_read_bits(dev, reg: int, bits: int, shift: int) -> int:
    return (ltr_read(dev, reg)[0] >> shift) & ((1 << bits) - 1)


class LtrHarness:
    """The worker's side of the slave: a virtual clock, the INT callback log,
    and the one timer the slave arms through on_conversion_scheduled."""

    def __init__(self, als: int = 45000, uvs: int = 1200) -> None:
        self.now = 0
        self.due: int | None = None
        self.int_events: list[bool] = []
        self.dev = LTR390Slave(lambda: self.now, self.int_events.append, self._schedule)
        self.dev.update(als=als, uvs=uvs)

    def _schedule(self, due_ns: int) -> None:
        self.due = due_ns

    def advance(self, ms: float) -> None:
        """Run the clock forward, firing tick() at every armed deadline inside the window."""
        target = self.now + round(ms * MS_NS)
        while self.due is not None and self.due <= target:
            self.now = self.due
            self.due = None
            self.dev.tick(self.now)
        self.now = target

    def set_als(self, v: int) -> None:
        self.dev.update(als=v)

    def set_uvs(self, v: int) -> None:
        self.dev.update(uvs=v)


def ltr_begin(dev) -> bool:
    """The library's begin() sequence: part ID check, soft reset, enable."""
    if ltr_read(dev, 0x06)[0] >> 4 != 0xB:
        return False
    ltr_write_bits(dev, 0x00, 1, 4, 1)
    if ltr_read_bits(dev, 0x00, 1, 4):
        return False
    ltr_write_bits(dev, 0x00, 1, 1, 1)
    return ltr_read_bits(dev, 0x00, 1, 1) == 1


def ltr_config_interrupt(dev, lower: int, upper: int, source: str, persistence: int = 0) -> None:
    """setThresholds() + configInterrupt(), the way the Adafruit library writes them."""
    def write24(base: int, v: int) -> None:
        write_regs(dev, base, v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0x0F)
    write24(0x24, lower)
    write24(0x21, upper)
    ltr_write_bits(dev, 0x19, 1, 2, 1)
    ltr_write_bits(dev, 0x19, 2, 4, 3 if source == 'uvs' else 1)
    ltr_write_bits(dev, 0x1A, 4, 4, persistence)


def test_ltr390_identity_and_begin():
    h = LtrHarness()
    assert h.dev.addr == 0x53
    assert ltr_read(h.dev, 0x06)[0] >> 4 == 0xB
    assert ltr_begin(h.dev) is True


def test_ltr390_soft_reset_restores_defaults_and_reads_back_cleared():
    h = LtrHarness()
    write_regs(h.dev, 0x05, 0x04)
    write_regs(h.dev, 0x04, 0x00)
    ltr_write_bits(h.dev, 0x00, 1, 4, 1)
    assert ltr_read_bits(h.dev, 0x00, 1, 4) == 0
    assert ltr_read(h.dev, 0x05) == [0x01]
    assert ltr_read(h.dev, 0x04) == [0x22]


def test_ltr390_auto_increments_across_a_multi_byte_read():
    assert ltr_read(LtrHarness().dev, 0x04, 3) == [0x22, 0x01, 0xB2]


def test_ltr390_pointer_survives_the_repeated_start_and_an_empty_probe():
    dev = LtrHarness().dev
    dev.handle_event(I2C_START_SEND); dev.handle_event(I2C_FINISH)
    assert dev.handle_event(I2C_START_SEND) == 0
    assert dev.handle_event(write_event(0x06)) == 0
    dev.handle_event(I2C_FINISH)
    assert dev.handle_event(I2C_START_RECV) == 0
    assert dev.handle_event(I2C_READ) == 0xB2


@pytest.mark.parametrize('reg', [0x06, 0x07, 0x0D, 0x0E, 0x0F, 0x10, 0x11, 0x12])
def test_ltr390_rejects_writes_to_read_only_registers(reg):
    with pytest.raises(ValueError, match='read-only'):
        write_regs(LtrHarness().dev, reg, 0x00)


def test_ltr390_rejects_writes_to_every_register_outside_the_map():
    writable = {0x00, 0x04, 0x05, 0x19, 0x1A, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26}
    read_only = {0x06, 0x07, 0x0D, 0x0E, 0x0F, 0x10, 0x11, 0x12}
    for reg in range(256):
        if reg in writable or reg in read_only:
            continue
        with pytest.raises(ValueError, match='reserved'):
            write_regs(LtrHarness().dev, reg, 0x00)


def test_ltr390_multi_byte_write_past_the_threshold_block_raises():
    with pytest.raises(ValueError, match='reserved register 0x27'):
        write_regs(LtrHarness().dev, 0x24, 1, 2, 3, 4)


def test_ltr390_mode_bit_round_trips_and_keeps_the_enable_bit():
    h = LtrHarness()
    ltr_begin(h.dev)
    assert ltr_read_bits(h.dev, 0x00, 1, 3) == 0
    ltr_write_bits(h.dev, 0x00, 1, 3, 1)
    assert ltr_read_bits(h.dev, 0x00, 1, 3) == 1
    assert ltr_read_bits(h.dev, 0x00, 1, 1) == 1
    ltr_write_bits(h.dev, 0x00, 1, 3, 0)
    assert ltr_read_bits(h.dev, 0x00, 1, 3) == 0


def test_ltr390_gain_and_resolution_round_trip():
    h = LtrHarness()
    ltr_begin(h.dev)
    for gain in range(5):
        ltr_write_bits(h.dev, 0x05, 3, 0, gain)
        assert ltr_read_bits(h.dev, 0x05, 3, 0) == gain
    for res in range(6):
        ltr_write_bits(h.dev, 0x04, 3, 4, res)
        assert ltr_read_bits(h.dev, 0x04, 3, 4) == res
        assert ltr_read(h.dev, 0x04)[0] & 0x07 == 0x02


def test_ltr390_stores_thresholds_and_interrupt_config_for_read_back():
    h = LtrHarness()
    ltr_begin(h.dev)
    write_regs(h.dev, 0x24, 0x64, 0x00, 0x00)
    write_regs(h.dev, 0x21, 0xE8, 0x03, 0x00)
    assert ltr_read24(h.dev, 0x24) == 100
    assert ltr_read24(h.dev, 0x21) == 1000
    ltr_write_bits(h.dev, 0x19, 1, 2, 1)
    ltr_write_bits(h.dev, 0x19, 2, 4, 3)
    assert ltr_read_bits(h.dev, 0x19, 1, 2) == 1
    assert ltr_read_bits(h.dev, 0x19, 2, 4) == 3
    ltr_write_bits(h.dev, 0x1A, 4, 4, 2)
    assert ltr_read_bits(h.dev, 0x1A, 4, 4) == 2


@pytest.mark.parametrize('uv_mode', [False, True])
@pytest.mark.parametrize('gain', range(5))
@pytest.mark.parametrize('res', range(6))
def test_ltr390_every_gain_resolution_mode_combination_converts_once_per_period(uv_mode, gain, res):
    # Multiples of 24 scale to whole counts, below every full scale.
    h = LtrHarness(4800, 240)
    ltr_begin(h.dev)
    ltr_write_bits(h.dev, 0x05, 3, 0, gain)
    ltr_write_bits(h.dev, 0x04, 3, 4, res)
    ltr_write_bits(h.dev, 0x00, 1, 3, 1 if uv_mode else 0)
    assert ltr_read_bits(h.dev, 0x05, 3, 0) == gain
    assert ltr_read_bits(h.dev, 0x04, 3, 4) == res
    assert ltr_read_bits(h.dev, 0x00, 1, 3) == (1 if uv_mode else 0)
    assert ltr_read_bits(h.dev, 0x00, 1, 1) == 1

    period = max(LTR_INTEGRATION_MS[res], LTR_RATE_MS[2])
    h.advance(period - 4)
    assert ltr_read_bits(h.dev, 0x07, 1, 3) == 0
    h.advance(6)
    assert ltr_read_bits(h.dev, 0x07, 1, 3) == 1
    scale = LTR_GAIN_X[gain] / 3 * (LTR_INTEGRATION_MS[res] / 100)
    assert ltr_read24(h.dev, 0x10 if uv_mode else 0x0D) == (240 if uv_mode else 4800) * scale
    # The other mode's register has never been latched.
    assert ltr_read24(h.dev, 0x0D if uv_mode else 0x10) == 0


@pytest.mark.parametrize('rate', range(8))
def test_ltr390_every_measurement_rate_code(rate):
    h = LtrHarness()
    ltr_begin(h.dev)
    ltr_write_bits(h.dev, 0x04, 3, 4, 5)
    ltr_write_bits(h.dev, 0x04, 3, 0, rate)
    assert ltr_read(h.dev, 0x04) == [0x50 | rate]
    period = max(LTR_INTEGRATION_MS[5], LTR_RATE_MS[rate])
    for _ in range(2):
        h.advance(period - 4)
        assert ltr_read_bits(h.dev, 0x07, 1, 3) == 0
        h.advance(6)
        assert ltr_read_bits(h.dev, 0x07, 1, 3) == 1


def test_ltr390_schedules_each_conversion_on_the_worker_timer():
    h = LtrHarness()
    assert h.due is None                       # nothing armed while disabled
    ltr_begin(h.dev)
    assert h.due == 100 * MS_NS                # enable → one period out
    h.advance(100)
    assert h.due == 200 * MS_NS                # tick re-arms the next one
    ltr_write_bits(h.dev, 0x04, 3, 4, 5)       # 13-bit: restart, 100 ms rate still dominates
    assert h.due == 200 * MS_NS
    ltr_write_bits(h.dev, 0x04, 3, 0, 0)       # 25 ms rate
    assert h.due == 125 * MS_NS
    ltr_write_bits(h.dev, 0x00, 1, 1, 0)       # disable: the armed timer fires into a no-op
    h.advance(500)
    assert ltr_read_bits(h.dev, 0x07, 1, 3) == 0
    assert h.due is None


def test_ltr390_data_ready_appears_after_a_conversion_and_clears_on_read():
    h = LtrHarness()
    ltr_begin(h.dev)
    assert ltr_read_bits(h.dev, 0x07, 1, 3) == 0
    h.advance(50)
    assert ltr_read_bits(h.dev, 0x07, 1, 3) == 0
    h.advance(100)
    assert ltr_read_bits(h.dev, 0x07, 1, 3) == 1
    assert ltr_read_bits(h.dev, 0x07, 1, 3) == 0
    h.advance(100)
    assert ltr_read_bits(h.dev, 0x07, 1, 3) == 1


def test_ltr390_serves_20_bit_counts_lsb_first():
    h = LtrHarness(45000, 1200)
    ltr_begin(h.dev)
    h.advance(150)
    assert ltr_read24(h.dev, 0x0D) == 45000
    ltr_write_bits(h.dev, 0x00, 1, 3, 1)
    h.advance(150)
    assert ltr_read24(h.dev, 0x10) == 1200
    ltr_write_bits(h.dev, 0x04, 3, 4, 0)       # 20-bit
    h.set_uvs(0xFFFFF)
    h.advance(450)
    assert ltr_read24(h.dev, 0x10) == 0xFFFFF


def test_ltr390_scales_counts_with_gain_and_integration_time():
    h = LtrHarness(45000, 24000)
    ltr_begin(h.dev)
    ltr_write_bits(h.dev, 0x05, 3, 0, 0)       # gain 1
    ltr_write_bits(h.dev, 0x04, 3, 4, 5)       # 13-bit, 12.5 ms
    h.advance(150)
    assert ltr_read24(h.dev, 0x0D) == 1875     # 45000 / 3 / 8
    h.set_als(1000)
    h.advance(100)
    assert ltr_read24(h.dev, 0x0D) == 42       # 41.67 rounds up
    ltr_write_bits(h.dev, 0x05, 3, 0, 4)       # gain 18
    ltr_write_bits(h.dev, 0x04, 3, 4, 0)       # 20-bit, 400 ms
    ltr_write_bits(h.dev, 0x00, 1, 3, 1)       # UVS
    h.advance(450)
    assert ltr_read24(h.dev, 0x10) == 576000   # 24000 × 6 × 4, above 16 bits


def test_ltr390_saturates_at_the_resolution_full_scale():
    h = LtrHarness(0xFFFFF, 45000)
    ltr_begin(h.dev)
    h.advance(150)
    assert ltr_read24(h.dev, 0x0D) == 0x3FFFF  # default 18-bit
    ltr_write_bits(h.dev, 0x05, 3, 0, 4)       # gain 18
    ltr_write_bits(h.dev, 0x04, 3, 4, 4)       # 16-bit
    ltr_write_bits(h.dev, 0x00, 1, 3, 1)       # UVS: 45000 × 6 / 4 = 67500
    h.advance(150)
    assert ltr_read24(h.dev, 0x10) == 0xFFFF
    ltr_write_bits(h.dev, 0x04, 3, 4, 5)       # 13-bit
    h.advance(150)
    assert ltr_read24(h.dev, 0x10) == 0x1FFF


@pytest.mark.parametrize('reg,value', [(0x04, 0x62), (0x04, 0x72), (0x04, 0xA2), (0x04, 0x2A),
                                       (0x05, 5), (0x05, 6), (0x05, 7), (0x05, 0x09)])
def test_ltr390_rejects_reserved_resolution_and_gain_codes_and_bits(reg, value):
    h = LtrHarness()
    ltr_begin(h.dev)
    with pytest.raises(ValueError, match='reserved'):
        write_regs(h.dev, reg, value)


def test_ltr390_only_the_active_mode_advances():
    h = LtrHarness(45000, 1200)
    ltr_begin(h.dev)
    ltr_write_bits(h.dev, 0x00, 1, 3, 1)
    h.advance(150)
    assert ltr_read24(h.dev, 0x10) == 1200
    ltr_write_bits(h.dev, 0x00, 1, 3, 0)
    h.set_uvs(9999)
    h.advance(150)
    assert ltr_read24(h.dev, 0x0D) == 45000
    assert ltr_read24(h.dev, 0x10) == 1200


def test_ltr390_mode_switch_restarts_the_conversion_so_data_ready_drops():
    h = LtrHarness()
    ltr_begin(h.dev)
    h.advance(150)
    ltr_write_bits(h.dev, 0x00, 1, 3, 1)
    assert ltr_read_bits(h.dev, 0x07, 1, 3) == 0
    h.advance(50)
    assert ltr_read_bits(h.dev, 0x07, 1, 3) == 0
    h.advance(100)
    assert ltr_read_bits(h.dev, 0x07, 1, 3) == 1


def test_ltr390_picks_up_a_changed_reading_on_the_next_conversion():
    h = LtrHarness(45000)
    ltr_begin(h.dev)
    h.advance(150)
    assert ltr_read24(h.dev, 0x0D) == 45000
    h.set_als(12345)
    h.advance(100)
    assert ltr_read24(h.dev, 0x0D) == 12345


def test_ltr390_does_not_convert_while_disabled():
    h = LtrHarness()
    ltr_begin(h.dev)
    ltr_write_bits(h.dev, 0x00, 1, 1, 0)
    h.advance(500)
    assert ltr_read_bits(h.dev, 0x07, 1, 3) == 0


def test_ltr390_period_is_the_larger_of_rate_and_integration():
    h = LtrHarness()
    ltr_begin(h.dev)
    ltr_write_bits(h.dev, 0x04, 3, 4, 5)   # 13-bit, 12.5 ms integration
    ltr_write_bits(h.dev, 0x04, 3, 0, 6)   # 2000 ms rate dominates
    h.advance(1000)
    assert ltr_read_bits(h.dev, 0x07, 1, 3) == 0
    h.advance(1100)
    assert ltr_read_bits(h.dev, 0x07, 1, 3) == 1
    ltr_write_bits(h.dev, 0x04, 3, 4, 0)   # 20-bit, 400 ms integration
    ltr_write_bits(h.dev, 0x04, 3, 0, 0)   # 25 ms rate — integration dominates
    h.advance(300)
    assert ltr_read_bits(h.dev, 0x07, 1, 3) == 0
    h.advance(150)
    assert ltr_read_bits(h.dev, 0x07, 1, 3) == 1


def test_ltr390_raises_on_a_count_outside_the_20_bit_range():
    h = LtrHarness(0x100000)
    ltr_begin(h.dev)
    with pytest.raises(ValueError, match='als must be a number'):
        h.advance(150)


def test_ltr390_interrupt_idles_released_with_thresholds_wide_open():
    h = LtrHarness()
    ltr_begin(h.dev)
    h.advance(500)
    assert h.dev.interrupt_asserted is False
    assert h.int_events == []
    assert ltr_read24(h.dev, 0x21) == 0xFFFFF
    assert ltr_read24(h.dev, 0x24) == 0


def test_ltr390_interrupt_asserts_above_upper_and_below_lower():
    h = LtrHarness(45000)
    ltr_begin(h.dev)
    ltr_config_interrupt(h.dev, 100, 50000, 'als')
    h.advance(150)
    assert h.dev.interrupt_asserted is False
    h.set_als(60000)
    h.advance(150)
    assert h.dev.interrupt_asserted is True
    assert h.int_events == [True]

    low = LtrHarness(45000)
    ltr_begin(low.dev)
    ltr_config_interrupt(low.dev, 1000, 50000, 'als')
    low.set_als(50)
    low.advance(150)
    assert low.dev.interrupt_asserted is True


def test_ltr390_int_status_latches_and_clears_with_the_pin_on_a_status_read():
    h = LtrHarness(60000)
    ltr_begin(h.dev)
    ltr_config_interrupt(h.dev, 100, 50000, 'als')
    h.advance(150)
    assert ltr_read(h.dev, 0x07)[0] & 0x04 == 0x04
    assert h.dev.interrupt_asserted is False
    assert h.int_events == [True, False]
    assert ltr_read(h.dev, 0x07)[0] & 0x04 == 0x00
    # …and re-asserts on the next out-of-range conversion.
    h.advance(100)
    assert h.dev.interrupt_asserted is True


def test_ltr390_interrupt_enable_bit_gates_and_releases():
    h = LtrHarness(60000)
    ltr_begin(h.dev)
    ltr_config_interrupt(h.dev, 100, 50000, 'als')
    ltr_write_bits(h.dev, 0x19, 1, 2, 0)
    h.advance(500)
    assert h.dev.interrupt_asserted is False

    h = LtrHarness(60000)
    ltr_begin(h.dev)
    ltr_config_interrupt(h.dev, 100, 50000, 'als')
    h.advance(150)
    assert h.dev.interrupt_asserted is True
    ltr_write_bits(h.dev, 0x19, 1, 2, 0)
    assert h.dev.interrupt_asserted is False
    assert h.int_events == [True, False]


def test_ltr390_interrupt_ignores_the_mode_that_is_not_the_source():
    h = LtrHarness(60000, 1200)
    ltr_begin(h.dev)
    ltr_config_interrupt(h.dev, 100, 50000, 'uvs')
    h.advance(150)
    assert h.dev.interrupt_asserted is False
    ltr_write_bits(h.dev, 0x00, 1, 3, 1)
    h.set_uvs(70000)
    h.advance(150)
    assert h.dev.interrupt_asserted is True


def test_ltr390_interrupt_honors_persistence_and_an_in_range_reading_restarts_the_run():
    h = LtrHarness(60000)
    ltr_begin(h.dev)
    ltr_config_interrupt(h.dev, 100, 50000, 'als', persistence=2)
    h.advance(150)
    assert h.dev.interrupt_asserted is False
    h.advance(100)
    assert h.dev.interrupt_asserted is False
    h.advance(100)
    assert h.dev.interrupt_asserted is True

    h = LtrHarness(60000)
    ltr_begin(h.dev)
    ltr_config_interrupt(h.dev, 100, 50000, 'als', persistence=2)
    h.advance(150)
    h.advance(100)
    h.set_als(45000)
    h.advance(100)
    assert h.dev.interrupt_asserted is False
    h.set_als(60000)
    h.advance(100)
    h.advance(100)
    assert h.dev.interrupt_asserted is False
    h.advance(100)
    assert h.dev.interrupt_asserted is True


def test_ltr390_soft_reset_clears_the_interrupt_and_reopens_the_thresholds():
    h = LtrHarness(60000)
    ltr_begin(h.dev)
    ltr_config_interrupt(h.dev, 100, 50000, 'als')
    h.advance(150)
    assert h.dev.interrupt_asserted is True
    ltr_write_bits(h.dev, 0x00, 1, 4, 1)
    assert h.dev.interrupt_asserted is False
    assert ltr_read24(h.dev, 0x21) == 0xFFFFF
    assert ltr_read24(h.dev, 0x24) == 0


class TestLTR390Slave(unittest.TestCase):
    """Conversions on an injected clock: modes, pacing, data-ready, thresholds."""

    ALS_MODE = 0x02
    UVS_MODE = 0x0A

    def setUp(self):
        self.harness = LtrHarness()
        self.slave = self.harness.dev
        self.int_edges = self.harness.int_events

    def advance(self, ms: float) -> None:
        self.harness.advance(ms)

    def read20(self, reg: int) -> int:
        return int.from_bytes(bytes(i2c_read_seq(self.slave, reg, 3)), 'little')

    def status(self) -> int:
        return i2c_read_seq(self.slave, 0x07, 1)[0]

    def test_power_on_registers(self):
        self.assertEqual(i2c_read_seq(self.slave, 0x00, 1), [0x00])
        self.assertEqual(i2c_read_seq(self.slave, 0x04, 3), [0x22, 0x01, 0xB2])
        self.assertEqual(i2c_read_seq(self.slave, 0x19, 2), [0x00, 0x00])
        self.assertEqual(i2c_read_seq(self.slave, 0x21, 6), [0xFF, 0xFF, 0x0F, 0, 0, 0])

    def test_standby_never_converts(self):
        self.advance(5000)
        self.assertEqual(self.status(), 0)
        self.assertEqual(self.read20(0x0D), 0)

    def test_first_als_reading_takes_one_period(self):
        i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
        self.advance(99)
        self.assertEqual(self.status(), 0)
        self.advance(1)
        self.assertEqual(self.status(), 0x08)
        self.assertEqual(self.read20(0x0D), 45000)
        self.assertEqual(self.read20(0x10), 0)

    def test_status_read_clears_data_ready_until_the_next_conversion(self):
        i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
        self.advance(100)
        self.assertEqual(self.status(), 0x08)
        self.assertEqual(self.status(), 0)
        self.advance(100)
        self.assertEqual(self.status(), 0x08)

    def test_uvs_mode_fills_the_uvs_registers_only(self):
        i2c_write_seq(self.slave, 0x00, [self.UVS_MODE])
        self.advance(100)
        self.assertEqual(self.read20(0x10), 1200)
        self.assertEqual(self.read20(0x0D), 0)

    def test_mode_switch_restarts_and_keeps_the_other_reading(self):
        i2c_write_seq(self.slave, 0x00, [self.UVS_MODE])
        self.advance(150)
        i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
        self.assertEqual(self.status(), 0)
        self.advance(99)
        self.assertEqual(self.status(), 0)
        self.advance(1)
        self.assertEqual(self.status(), 0x08)
        self.assertEqual(self.read20(0x0D), 45000)
        self.assertEqual(self.read20(0x10), 1200)

    def test_rewriting_the_same_mode_does_not_restart(self):
        i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
        self.advance(60)
        i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
        self.advance(40)
        self.assertEqual(self.status(), 0x08)

    def test_update_is_seen_by_the_next_conversion(self):
        i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
        self.advance(150)
        self.slave.update(als=320, uvs=24000)
        self.assertEqual(self.read20(0x0D), 45000)
        self.advance(50)
        self.assertEqual(self.read20(0x0D), 320)

    def test_full_scale_and_zero(self):
        self.slave.update(als=0xFFFFF, uvs=0)
        i2c_write_seq(self.slave, 0x04, [0x02])   # 20-bit, 100 ms rate
        i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
        self.advance(400)
        self.assertEqual(i2c_read_seq(self.slave, 0x0D, 3), [0xFF, 0xFF, 0x0F])
        i2c_write_seq(self.slave, 0x00, [self.UVS_MODE])
        self.advance(400)
        self.assertEqual(self.read20(0x10), 0)

    def test_period_is_the_longer_of_integration_and_rate(self):
        for meas_rate, period_ms in ((0x00, 400), (0x05, 1000), (0x40, 25), (0x50, 25), (0x52, 100), (0x13, 200)):
            with self.subTest(meas_rate=hex(meas_rate)):
                self.setUp()
                i2c_write_seq(self.slave, 0x04, [meas_rate])
                i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
                self.advance(period_ms - 1)
                self.assertEqual(self.status(), 0)
                self.advance(1)
                self.assertEqual(self.status(), 0x08)
                self.advance(period_ms - 1)
                self.assertEqual(self.status(), 0)
                self.advance(1)
                self.assertEqual(self.status(), 0x08)

    def test_gain_reads_back_and_scales_the_count(self):
        i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
        for gain, count in zip(range(5), (15000, 45000, 90000, 135000, 262143)):
            i2c_write_seq(self.slave, 0x05, [gain])
            self.assertEqual(i2c_read_seq(self.slave, 0x05, 1), [gain])
            self.advance(100)
            self.assertEqual(self.read20(0x0D), count)

    def test_config_write_while_enabled_restarts_the_conversion(self):
        i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
        self.advance(90)
        i2c_write_seq(self.slave, 0x05, [0x04])
        self.advance(10)
        self.assertEqual(self.status(), 0)
        self.advance(90)
        self.assertEqual(self.status(), 0x08)

    def test_soft_reset_restores_defaults_and_reads_back_clear(self):
        i2c_write_seq(self.slave, 0x04, [0x40])
        i2c_write_seq(self.slave, 0x05, [0x04])
        i2c_write_seq(self.slave, 0x00, [self.UVS_MODE])
        i2c_write_seq(self.slave, 0x00, [0x10])
        self.assertEqual(i2c_read_seq(self.slave, 0x00, 1), [0x00])
        self.assertEqual(i2c_read_seq(self.slave, 0x04, 2), [0x22, 0x01])
        self.advance(1000)
        self.assertEqual(self.status(), 0)

    def test_disable_stops_conversions_and_drops_data_ready(self):
        i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
        self.advance(100)
        i2c_write_seq(self.slave, 0x00, [0x00])
        self.assertEqual(self.status(), 0)
        self.slave.update(als=7, uvs=7)
        self.advance(1000)
        self.assertEqual(self.read20(0x0D), 45000)

    def test_reserved_and_read_only_writes_raise(self):
        for reg, value in ((0x06, 0x00), (0x07, 0x00), (0x0D, 0x01), (0x10, 0x01), (0x01, 0x00), (0x27, 0x00)):
            with self.subTest(reg=hex(reg)), self.assertRaises(ValueError):
                i2c_write_seq(self.slave, reg, [value])

    def configure_interrupt(self, source_uvs: bool, low: int, high: int, persist: int = 0) -> None:
        i2c_write_seq(self.slave, 0x21, list(high.to_bytes(3, 'little')) + list(low.to_bytes(3, 'little')))
        i2c_write_seq(self.slave, 0x1A, [persist << 4])
        i2c_write_seq(self.slave, 0x19, [(0x30 if source_uvs else 0x10) | 0x04])

    def test_interrupt_fires_above_the_upper_threshold_and_status_read_releases_it(self):
        self.configure_interrupt(False, 1000, 50000)
        i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
        self.advance(100)
        self.assertEqual(self.int_edges, [])
        self.slave.update(als=60000, uvs=1200)
        self.advance(100)
        self.assertEqual(self.int_edges, [True])
        self.assertEqual(self.status(), 0x0C)
        self.assertEqual(self.int_edges, [True, False])
        self.assertEqual(self.status(), 0)

    def test_interrupt_fires_below_the_lower_threshold(self):
        self.configure_interrupt(False, 1000, 50000)
        self.slave.update(als=999, uvs=1200)
        i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
        self.advance(100)
        self.assertEqual(self.int_edges, [True])

    def test_interrupt_stays_latched_after_the_reading_returns_in_range(self):
        self.configure_interrupt(False, 1000, 50000)
        self.slave.update(als=60000, uvs=1200)
        i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
        self.advance(100)
        self.slave.update(als=45000, uvs=1200)
        self.advance(300)
        self.assertEqual(self.int_edges, [True])

    def test_interrupt_refires_after_each_release_while_out_of_range(self):
        self.configure_interrupt(False, 1000, 50000)
        self.slave.update(als=60000, uvs=1200)
        i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
        for _ in range(3):
            self.advance(100)
            self.assertEqual(self.status() & 0x04, 0x04)
        self.assertEqual(self.int_edges, [True, False] * 3)

    def test_persistence_needs_consecutive_readings(self):
        self.configure_interrupt(False, 1000, 50000, persist=2)
        self.slave.update(als=60000, uvs=1200)
        i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
        self.advance(200)
        self.assertEqual(self.int_edges, [])
        self.advance(100)
        self.assertEqual(self.int_edges, [True])

    def test_an_in_range_reading_resets_persistence(self):
        self.configure_interrupt(False, 1000, 50000, persist=1)
        self.slave.update(als=60000, uvs=1200)
        i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
        self.advance(100)
        self.slave.update(als=45000, uvs=1200)
        self.advance(100)
        self.slave.update(als=60000, uvs=1200)
        self.advance(100)
        self.assertEqual(self.int_edges, [])
        self.advance(100)
        self.assertEqual(self.int_edges, [True])

    def test_only_the_source_mode_trips_the_interrupt(self):
        self.configure_interrupt(True, 0, 5000)
        self.slave.update(als=60000, uvs=24000)
        i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
        self.advance(300)
        self.assertEqual(self.int_edges, [])
        i2c_write_seq(self.slave, 0x00, [self.UVS_MODE])
        self.advance(100)
        self.assertEqual(self.int_edges, [True])

    def test_disabling_the_interrupt_releases_the_line(self):
        self.configure_interrupt(False, 1000, 50000)
        self.slave.update(als=60000, uvs=1200)
        i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
        self.advance(100)
        i2c_write_seq(self.slave, 0x19, [0x10])
        self.assertEqual(self.int_edges, [True, False])
        self.advance(300)
        self.assertEqual(self.int_edges, [True, False])

    def test_soft_reset_releases_the_line(self):
        self.configure_interrupt(False, 1000, 50000)
        self.slave.update(als=60000, uvs=1200)
        i2c_write_seq(self.slave, 0x00, [self.ALS_MODE])
        self.advance(100)
        i2c_write_seq(self.slave, 0x00, [0x10])
        self.assertEqual(self.int_edges, [True, False])

    def test_two_runs_are_identical(self):
        def run() -> list:
            self.setUp()
            seen = []
            i2c_write_seq(self.slave, 0x00, [self.UVS_MODE])
            for step in range(40):
                self.advance(37)
                if step == 20:
                    self.slave.update(als=320, uvs=24000)
                seen.append((self.status(), self.read20(0x10)))
            return seen
        self.assertEqual(run(), run())


def test_ltr390_rejects_an_unknown_i2c_event():
    with pytest.raises(ValueError, match='ltr390: unsupported I2C event 0x02'):
        LTR390Slave(lambda: 0).handle_event(0x02)
