"""Unit tests for embedgym_parts/i2c/vl53l0x.py (VL53L0XSlave): the frontend-mirroring cases
over the picsimlab I2C event encoding, then the register-level cases."""
from __future__ import annotations

import unittest

import pytest

from esp32_i2c_slaves import I2C_FINISH, I2C_READ, I2C_START_RECV, I2C_START_SEND
from embedgym_parts.i2c.vl53l0x import VL53L0XSlave
from i2c_bus import MS_NS, i2c_read_seq, i2c_write_seq, read_regs, write_event, write_regs


# ── VL53L0X (mirrors vl53l0x-protocol.test.ts part 1) ────────────────────────


class TofHarness:
    """The worker's side of the slave: a virtual clock, the address-change log,
    and the one timer the slave arms through on_measurement_scheduled."""

    def __init__(self, distance: float = 100) -> None:
        self.now = 0
        self.due: int | None = None
        self.address_changes: list[tuple[int, int]] = []
        self.dev = VL53L0XSlave(lambda: self.now, self._moved, self._schedule)
        self.dev.update(distance)

    def _moved(self, old: int, new: int) -> None:
        self.address_changes.append((old, new))

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

    def set_distance(self, mm: float) -> None:
        self.dev.update(mm)


def tof_write(dev, reg: int, *data: int) -> None:
    write_regs(dev, reg, *data)


def tof_read(dev, reg: int, n: int = 1) -> list[int]:
    return read_regs(dev, reg, n)


def tof_read_word(dev, reg: int) -> int:
    msb, lsb = tof_read(dev, reg, 2)
    return (msb << 8) | lsb


def tof_write_period(dev, period_ms: int) -> None:
    """The drivers store period_ms × OSC_CALIBRATE_VAL as a big-endian dword at 0x04."""
    stored = period_ms * 0x0BCC
    tof_write(dev, 0x04, (stored >> 24) & 0xFF, (stored >> 16) & 0xFF, (stored >> 8) & 0xFF, stored & 0xFF)


def test_vl53l0x_identity_and_preloads():
    dev = TofHarness().dev
    assert dev.addr == 0x29
    assert tof_read(dev, 0xC0)[0] == 0xEE
    assert tof_read(dev, 0xC2)[0] == 0x10
    assert tof_read_word(dev, 0xF8) == 0x0BCC
    assert tof_read(dev, 0xC0, 3) == [0xEE, 0xAA, 0x10]


def test_vl53l0x_latch_stores_multi_byte_writes_and_echoes_the_spad_map():
    dev = TofHarness().dev
    tof_write(dev, 0x71, 0x01, 0xFE)
    assert tof_read(dev, 0x71, 2) == [0x01, 0xFE]
    tof_write(dev, 0xB0, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00)
    assert tof_read(dev, 0xB0, 6) == [0x07, 0x00, 0x00, 0x00, 0x00, 0x00]


def test_vl53l0x_pointer_survives_the_repeated_start_and_an_empty_probe():
    dev = TofHarness().dev
    assert dev.handle_event(I2C_START_SEND) == 0
    dev.handle_event(I2C_FINISH)
    assert tof_read(dev, 0xC0)[0] == 0xEE


def test_vl53l0x_nvm_strobe_never_reads_zero():
    dev = TofHarness().dev
    tof_write(dev, 0x83, 0x00)
    assert tof_read(dev, 0x83)[0] != 0x00


def test_vl53l0x_nvm_window_serves_the_reference_spad_and_good_spad_dwords():
    dev = TofHarness().dev
    tof_write(dev, 0x81, 0x01)
    tof_write(dev, 0x94, 0x6B)
    assert tof_read(dev, 0x90, 4) == [0x00, 0x00, 0x88, 0x00]
    tof_write(dev, 0x94, 0x24)
    assert tof_read(dev, 0x90, 4) == [0xFF, 0xFF, 0xFF, 0xFF]
    tof_write(dev, 0x94, 0x25)
    assert tof_read(dev, 0x90, 4) == [0xFF, 0xFF, 0x00, 0x00]
    tof_write(dev, 0x94, 0x02)
    assert tof_read(dev, 0x90, 4) == [0x00, 0x00, 0x00, 0x00]


def test_vl53l0x_0x91_is_the_stop_variable_latch_outside_nvm_mode():
    dev = TofHarness().dev
    tof_write(dev, 0x81, 0x00)
    stop_var = tof_read(dev, 0x91)[0]
    assert stop_var == 0x3C
    tof_write(dev, 0x91, stop_var)
    assert tof_read(dev, 0x91)[0] == stop_var


def test_vl53l0x_single_shot_start_bit_clears_and_interrupt_asserts_0x04():
    dev = TofHarness().dev
    tof_write(dev, 0x00, 0x01)
    assert tof_read(dev, 0x00)[0] & 0x01 == 0
    assert tof_read(dev, 0x13)[0] & 0x07 == 0x04
    tof_write(dev, 0x0B, 0x01)
    assert tof_read(dev, 0x13)[0] == 0x00


def test_vl53l0x_vhv_calibration_trigger_completes_the_same_way():
    dev = TofHarness().dev
    tof_write(dev, 0x00, 0x41)
    assert tof_read(dev, 0x13)[0] & 0x07 == 0x04


def test_vl53l0x_result_block_carries_the_driven_distance():
    h = TofHarness(1234)
    tof_write(h.dev, 0x00, 0x01)
    assert tof_read_word(h.dev, 0x1E) == 1234
    h.set_distance(400)
    tof_write(h.dev, 0x00, 0x01)
    block = tof_read(h.dev, 0x14, 12)
    assert block[0] == 0x59
    assert (block[6] << 8) | block[7] > 0
    assert (block[10] << 8) | block[11] == 400


def test_vl53l0x_page1_wrapper_write_of_0x00_is_not_a_trigger():
    dev = TofHarness().dev
    tof_write(dev, 0x80, 0x01)
    tof_write(dev, 0xFF, 0x01)
    tof_write(dev, 0x00, 0x00)
    tof_write(dev, 0x91, 0x3C)
    tof_write(dev, 0x00, 0x01)
    tof_write(dev, 0xFF, 0x00)
    tof_write(dev, 0x80, 0x00)
    assert tof_read(dev, 0x13)[0] == 0x00


def test_vl53l0x_page1_0x04_reads_zero_whatever_the_period_dword_holds():
    dev = TofHarness().dev
    tof_write(dev, 0x04, 0x01, 0x02, 0x03, 0x04)
    tof_write(dev, 0xFF, 0x01)
    assert tof_read(dev, 0x04)[0] == 0x00
    tof_write(dev, 0xFF, 0x00)
    assert tof_read(dev, 0x04, 4) == [0x01, 0x02, 0x03, 0x04]


def test_vl53l0x_out_of_range_reports_status_9_and_8190_mm():
    h = TofHarness(2400)
    tof_write(h.dev, 0x00, 0x01)
    assert tof_read(h.dev, 0x14)[0] == 0x49
    assert tof_read_word(h.dev, 0x1E) == 8190
    h.set_distance(2000)
    tof_write(h.dev, 0x00, 0x01)
    assert tof_read(h.dev, 0x14)[0] == 0x59
    assert tof_read_word(h.dev, 0x1E) == 2000


def test_vl53l0x_raises_on_a_non_finite_or_negative_distance():
    h = TofHarness()
    h.set_distance(-5)
    with pytest.raises(ValueError, match='finite non-negative'):
        tof_write(h.dev, 0x00, 0x01)


def test_vl53l0x_timed_mode_first_result_after_one_budget_then_the_programmed_period():
    h = TofHarness()
    tof_write_period(h.dev, 300)
    tof_write(h.dev, 0x00, 0x04)
    assert h.due == 30 * MS_NS
    h.advance(10)
    assert tof_read(h.dev, 0x13)[0] == 0x00
    h.advance(25)
    assert tof_read(h.dev, 0x13)[0] & 0x07 == 0x04
    assert h.due == 330 * MS_NS
    tof_write(h.dev, 0x0B, 0x01)
    h.advance(165)
    assert tof_read(h.dev, 0x13)[0] == 0x00
    h.advance(140)
    assert tof_read(h.dev, 0x13)[0] & 0x07 == 0x04


def test_vl53l0x_interrupt_clear_does_not_re_assert_synchronously():
    h = TofHarness()
    tof_write(h.dev, 0x00, 0x02)
    h.advance(50)
    assert tof_read(h.dev, 0x13)[0] & 0x07 == 0x04
    tof_write(h.dev, 0x0B, 0x01)
    tof_write(h.dev, 0x0B, 0x00)
    assert tof_read(h.dev, 0x13)[0] == 0x00


def test_vl53l0x_back_to_back_mode_paces_at_30_ms_and_picks_up_new_distances():
    h = TofHarness()
    tof_write(h.dev, 0x00, 0x02)
    h.advance(40)
    tof_write(h.dev, 0x0B, 0x01)
    h.set_distance(750)
    h.advance(40)
    assert tof_read(h.dev, 0x13)[0] & 0x07 == 0x04
    assert tof_read_word(h.dev, 0x1E) == 750
    assert h.due == 90 * MS_NS


def test_vl53l0x_timed_period_has_a_5_ms_floor():
    h = TofHarness()
    tof_write_period(h.dev, 1)
    tof_write(h.dev, 0x00, 0x04)
    h.advance(30)
    assert h.due == 35 * MS_NS


def test_vl53l0x_stop_ends_pacing():
    h = TofHarness()
    tof_write_period(h.dev, 50)
    tof_write(h.dev, 0x00, 0x04)
    tof_write(h.dev, 0x00, 0x00)
    tof_write(h.dev, 0x0B, 0x01)
    h.advance(500)
    assert tof_read(h.dev, 0x13)[0] == 0x00


def test_vl53l0x_single_shot_cancels_a_continuous_mode():
    h = TofHarness()
    tof_write(h.dev, 0x00, 0x02)
    tof_write(h.dev, 0x00, 0x01)
    tof_write(h.dev, 0x0B, 0x01)
    h.advance(100)
    assert tof_read(h.dev, 0x13)[0] == 0x00


def test_vl53l0x_peak_signal_rate_ref_is_constant_above_the_20_mcps_target():
    dev = TofHarness().dev
    assert tof_read_word(dev, 0xB6) == 0x0C00
    tof_write(dev, 0xB6, 0xB4)
    assert tof_read_word(dev, 0xB6) == 0x0C00


def test_vl53l0x_address_register_moves_the_device_once():
    h = TofHarness()
    assert tof_read(h.dev, 0x8A)[0] == 0x29
    tof_write(h.dev, 0x8A, 0x29)
    assert h.dev.addr == 0x29
    assert h.address_changes == []
    tof_write(h.dev, 0x8A, 0x30)
    assert h.dev.addr == 0x30
    assert tof_read(h.dev, 0x8A)[0] == 0x30
    assert h.address_changes == [(0x29, 0x30)]


def test_vl53l0x_a_refused_address_change_leaves_the_device_where_it_was():
    def refuse(old: int, new: int) -> None:
        raise ValueError('taken')

    dev = VL53L0XSlave(lambda: 0, refuse)
    with pytest.raises(ValueError, match='taken'):
        tof_write(dev, 0x8A, 0x30)
    assert dev.addr == 0x29
    assert tof_read(dev, 0x8A)[0] == 0x29


def test_vl53l0x_rejects_unsupported_sysrange_start_values():
    dev = TofHarness().dev
    with pytest.raises(ValueError, match='SYSRANGE_START'):
        tof_write(dev, 0x00, 0x08)


class TestVL53L0XSlave(unittest.TestCase):
    """Register latch, live registers, and continuous ranging on an injected clock."""

    def setUp(self):
        self.ns = 0
        self.due = None
        self.moves = []
        self.slave = VL53L0XSlave(lambda: self.ns, lambda previous, new: self.moves.append((previous, new)),
                                  self.schedule)

    def schedule(self, due_ns: int) -> None:
        self.due = due_ns

    def advance(self, ms: float) -> None:
        """Run the clock forward, firing tick() at every deadline the slave armed."""
        target = self.ns + int(ms * 1_000_000)
        while self.due is not None and self.due <= target:
            self.ns, self.due = self.due, None
            self.slave.tick(self.ns)
        self.ns = target

    def read(self, reg: int, n: int = 1) -> list[int]:
        return i2c_read_seq(self.slave, reg, n)

    def word(self, reg: int) -> int:
        return int.from_bytes(bytes(self.read(reg, 2)), 'big')

    def write(self, reg: int, *data: int) -> None:
        i2c_write_seq(self.slave, reg, list(data))

    def set_period_ms(self, ms: int) -> None:
        self.write(0x04, *(ms * 0x0BCC).to_bytes(4, 'big'))

    def test_identity_and_preloads(self):
        self.assertEqual(self.slave.addr, 0x29)
        self.assertEqual(self.read(0xC0, 3), [0xEE, 0xAA, 0x10])
        self.assertEqual(self.word(0xF8), 0x0BCC)
        self.assertEqual(self.read(0x8A), [0x29])
        self.assertEqual(self.read(0x91), [0x3C])

    def test_latch_stores_multi_byte_writes_with_auto_increment(self):
        self.write(0x70, 0x12, 0x34, 0x56)
        self.assertEqual(self.read(0x70, 3), [0x12, 0x34, 0x56])
        self.write(0xB0, 0x00, 0xF0, 0x0F, 0x00, 0x00, 0x00)
        self.assertEqual(self.read(0xB0, 6), [0x00, 0xF0, 0x0F, 0x00, 0x00, 0x00])

    def test_register_pointer_survives_a_split_write_then_read(self):
        self.slave.handle_event(I2C_START_SEND)
        self.slave.handle_event(write_event(0xC0))
        self.slave.handle_event(I2C_FINISH)
        self.slave.handle_event(I2C_START_RECV)
        self.assertEqual(self.slave.handle_event(I2C_READ), 0xEE)
        self.slave.handle_event(I2C_FINISH)

    def test_nvm_strobe_never_reads_zero(self):
        self.write(0x83, 0x00)
        self.assertNotEqual(self.read(0x83), [0x00])

    def test_nvm_window_serves_the_spad_dwords_only_when_enabled(self):
        self.write(0x94, 0x6B)
        self.assertEqual(self.read(0x90, 4), [0x00, 0x3C, 0x00, 0x00])
        self.write(0x81, 0x01)
        self.assertEqual(self.read(0x90, 4), [0x00, 0x00, 0x88, 0x00])
        self.write(0x94, 0x24)
        self.assertEqual(self.read(0x90, 4), [0xFF, 0xFF, 0xFF, 0xFF])
        self.write(0x94, 0x25)
        self.assertEqual(self.read(0x90, 4), [0xFF, 0xFF, 0x00, 0x00])
        self.write(0x94, 0x02)
        self.assertEqual(self.read(0x90, 4), [0, 0, 0, 0])

    def test_single_shot_completes_inside_the_start_write(self):
        self.slave.update(distance=437)
        self.write(0x00, 0x01)
        self.assertEqual(self.read(0x00)[0] & 0x01, 0)
        self.assertEqual(self.read(0x13), [0x04])
        self.assertEqual(self.read(0x14, 12), [0x59, 0, 5, 0, 0, 0, 0, 0x60, 0, 0x04, 0x01, 0xB5])
        self.write(0x0B, 0x01)
        self.assertEqual(self.read(0x13), [0x00])

    def test_a_driven_distance_shows_only_in_the_next_measurement(self):
        self.write(0x00, 0x01)
        self.slave.update(distance=900)
        self.assertEqual(self.word(0x1E), 100)
        self.write(0x00, 0x01)
        self.assertEqual(self.word(0x1E), 900)

    def test_reference_calibration_start_completes_the_same_way(self):
        self.write(0x00, 0x41)
        self.assertEqual(self.read(0x00)[0] & 0x01, 0)
        self.assertEqual(self.read(0x13), [0x04])

    def test_page_1_writes_to_index_0_are_not_a_start(self):
        self.write(0x0B, 0x01)
        self.write(0xFF, 0x01)
        self.write(0x00, 0x01)
        self.write(0xFF, 0x00)
        self.assertEqual(self.read(0x13), [0x00])

    def test_page_1_index_4_reads_stop_completed(self):
        self.set_period_ms(300)
        self.write(0xFF, 0x01)
        self.assertEqual(self.read(0x04), [0x00])
        self.write(0xFF, 0x00)
        self.assertNotEqual(self.read(0x04, 4), [0, 0, 0, 0])

    def test_out_of_range_reports_phase_fail_and_8190(self):
        self.slave.update(distance=2000)
        self.write(0x00, 0x01)
        self.assertEqual((self.read(0x14)[0], self.word(0x1E)), (0x59, 2000))
        self.slave.update(distance=2000.6)
        self.write(0x00, 0x01)
        self.assertEqual((self.read(0x14)[0], self.word(0x1E)), (0x49, 8190))

    def test_half_millimetres_round_up(self):
        self.slave.update(distance=250.5)
        self.write(0x00, 0x01)
        self.assertEqual(self.word(0x1E), 251)

    def test_a_negative_or_non_finite_distance_raises_at_the_next_measurement(self):
        for bad in (-1, float('nan'), float('inf')):
            self.slave.update(distance=bad)
            with self.assertRaises(ValueError):
                self.write(0x00, 0x01)

    def test_timed_mode_first_result_after_one_budget_then_the_period(self):
        self.set_period_ms(300)
        self.write(0x00, 0x04)
        self.advance(29)
        self.assertEqual(self.read(0x13), [0x00])
        self.advance(1)
        self.assertEqual(self.read(0x13), [0x04])
        self.write(0x0B, 0x01)
        self.advance(299)
        self.assertEqual(self.read(0x13), [0x00])
        self.advance(1)
        self.assertEqual(self.read(0x13), [0x04])

    def test_back_to_back_mode_measures_every_budget_and_picks_up_new_distances(self):
        self.write(0x00, 0x02)
        self.advance(30)
        self.assertEqual(self.read(0x13), [0x04])
        self.write(0x0B, 0x01)
        self.slave.update(distance=750)
        self.advance(29)
        self.assertEqual(self.read(0x13), [0x00])
        self.assertEqual(self.word(0x1E), 100)
        self.advance(1)
        self.assertEqual(self.read(0x13), [0x04])
        self.assertEqual(self.word(0x1E), 750)

    def test_a_measurement_due_before_the_update_keeps_the_old_distance(self):
        self.write(0x00, 0x02)
        self.advance(31)
        self.slave.update(distance=750)
        self.assertEqual(self.word(0x1E), 100)

    def test_a_cleared_interrupt_stays_clear_until_the_next_measurement(self):
        self.write(0x00, 0x02)
        self.advance(50)
        self.assertEqual(self.read(0x13), [0x04])
        self.write(0x0B, 0x01)
        self.write(0x0B, 0x00)
        self.assertEqual(self.read(0x13), [0x00])

    def test_stop_ends_continuous_ranging(self):
        self.set_period_ms(50)
        self.write(0x00, 0x04)
        self.write(0x00, 0x00)
        self.advance(500)
        self.assertEqual(self.read(0x13), [0x00])

    def test_timed_period_has_a_floor(self):
        self.set_period_ms(0)
        self.write(0x00, 0x04)
        self.advance(30)
        self.write(0x0B, 0x01)
        self.advance(4)
        self.assertEqual(self.read(0x13), [0x00])
        self.advance(1)
        self.assertEqual(self.read(0x13), [0x04])

    def test_peak_signal_rate_ref_is_constant_above_the_spad_target(self):
        self.write(0xB6, 0xB4)
        self.assertEqual(self.word(0xB6), 0x0C00)

    def test_address_register_moves_the_device_once(self):
        self.write(0x8A, 0x29)
        self.assertEqual(self.moves, [])
        self.write(0x8A, 0x30)
        self.assertEqual(self.slave.addr, 0x30)
        self.assertEqual(self.read(0x8A), [0x30])
        self.assertEqual(self.moves, [(0x29, 0x30)])

    def test_address_change_without_a_listener(self):
        slave = VL53L0XSlave(lambda: 0)
        i2c_write_seq(slave, 0x8A, [0x31])
        self.assertEqual(slave.addr, 0x31)

    def test_unsupported_start_value_raises(self):
        with self.assertRaises(ValueError):
            self.write(0x00, 0x08)

    def test_a_nack_ends_the_write_so_the_next_byte_is_a_pointer(self):
        self.slave.handle_event(I2C_START_SEND)
        self.slave.handle_event(write_event(0x70))
        self.slave.handle_event(0x04)
        self.slave.handle_event(write_event(0xC0))
        self.slave.handle_event(I2C_START_RECV)
        self.assertEqual(self.slave.handle_event(I2C_READ), 0xEE)
        self.slave.handle_event(I2C_FINISH)


class Vl53l0xPololuHost:
    """The register traffic of the Pololu VL53L0X library: init(), single and
    continuous ranging. Polls run a bounded number of times, as the library's
    timeouts do."""

    TUNING = bytes.fromhex(
        'FF01 0000 FF00 0900 1000 1100 2401 25FF 7500 FF01 4E2C 4800 3020 FF00 3009 5400 3104 3203 4083 4625'
        '6000 2700 5006 5100 5296 5608 5730 6100 6200 6400 6500 66A0 FF01 2232 4714 49FF 4A00 FF00 7A0A 7B00'
        '7821 FF01 2334 4200 44FF 4526 4605 4040 0E06 201A 4340 FF00 3403 3544 FF01 3104 4B09 4C05 4D04 FF00'
        '4400 4520 4708 4828 6700 7004 7101 72FE 7600 7700 FF01 0D01 FF00 8001 01F8 FF01 8E01 0001 FF00 8000')

    def __init__(self, slave) -> None:
        self.slave = slave
        self.stop_variable = None

    def w(self, reg: int, *data: int) -> None:
        i2c_write_seq(self.slave, reg, list(data))

    def r(self, reg: int, n: int = 1) -> list[int]:
        return i2c_read_seq(self.slave, reg, n)

    def poll(self, done) -> None:
        for _ in range(50):
            if done():
                return
        raise TimeoutError('vl53l0x host: poll timed out')

    def init(self) -> None:
        if self.r(0xC0) != [0xEE]:
            raise RuntimeError('wrong model id')
        self.w(0x89, self.r(0x89)[0] | 0x01)
        self.w(0x88, 0x00)
        self.w(0x80, 0x01); self.w(0xFF, 0x01); self.w(0x00, 0x00)
        self.stop_variable = self.r(0x91)[0]
        self.w(0x00, 0x01); self.w(0xFF, 0x00); self.w(0x80, 0x00)
        self.w(0x60, self.r(0x60)[0] | 0x12)
        self.w(0x44, 0x00, 0x20)
        self.w(0x01, 0xFF)

        self.w(0x80, 0x01); self.w(0xFF, 0x01); self.w(0x00, 0x00)
        self.w(0xFF, 0x06)
        self.w(0x83, self.r(0x83)[0] | 0x04)
        self.w(0xFF, 0x07); self.w(0x81, 0x01); self.w(0x80, 0x01)
        self.w(0x94, 0x6B); self.w(0x83, 0x00)
        self.poll(lambda: self.r(0x83)[0] != 0x00)
        self.w(0x83, 0x01)
        spad = self.r(0x92)[0]
        self.spad_count, self.spad_is_aperture = spad & 0x7F, bool(spad & 0x80)
        self.w(0x81, 0x00); self.w(0xFF, 0x06)
        self.w(0x83, self.r(0x83)[0] & ~0x04)
        self.w(0xFF, 0x01); self.w(0x00, 0x01); self.w(0xFF, 0x00); self.w(0x80, 0x00)

        spad_map = self.r(0xB0, 6)
        self.w(0xFF, 0x01); self.w(0x4F, 0x00); self.w(0x4E, 0x2C); self.w(0xFF, 0x00); self.w(0xB6, 0xB4)
        first, enabled = (12 if self.spad_is_aperture else 0), 0
        for i in range(48):
            if i < first or enabled == self.spad_count:
                spad_map[i // 8] &= ~(1 << (i % 8))
            elif (spad_map[i // 8] >> (i % 8)) & 1:
                enabled += 1
        self.spads_enabled = enabled
        self.w(0xB0, *spad_map)

        for i in range(0, len(self.TUNING), 2):
            self.w(self.TUNING[i], self.TUNING[i + 1])
        self.w(0x0A, 0x04)
        self.w(0x84, self.r(0x84)[0] & ~0x10)
        self.w(0x0B, 0x01)

        self.w(0x01, 0x01); self.calibrate(0x40)
        self.w(0x01, 0x02); self.calibrate(0x00)
        self.w(0x01, 0xE8)

    def calibrate(self, vhv_init: int) -> None:
        self.w(0x00, 0x01 | vhv_init)
        self.poll(lambda: self.r(0x13)[0] & 0x07)
        self.w(0x0B, 0x01)
        self.w(0x00, 0x00)

    def restore_stop_variable(self) -> None:
        self.w(0x80, 0x01); self.w(0xFF, 0x01); self.w(0x00, 0x00)
        self.w(0x91, self.stop_variable)
        self.w(0x00, 0x01); self.w(0xFF, 0x00); self.w(0x80, 0x00)

    def read_continuous(self) -> int:
        self.poll(lambda: self.r(0x13)[0] & 0x07)
        mm = int.from_bytes(bytes(self.r(0x1E, 2)), 'big')
        self.w(0x0B, 0x01)
        return mm

    def read_single(self) -> int:
        self.restore_stop_variable()
        self.w(0x00, 0x01)
        self.poll(lambda: not self.r(0x00)[0] & 0x01)
        return self.read_continuous()

    def start_continuous(self, period_ms: int) -> None:
        self.restore_stop_variable()
        if period_ms:
            osc = int.from_bytes(bytes(self.r(0xF8, 2)), 'big')
            self.w(0x04, *(period_ms * osc).to_bytes(4, 'big'))
            self.w(0x00, 0x04)
        else:
            self.w(0x00, 0x02)

    def stop_continuous(self) -> None:
        self.w(0x00, 0x01)
        self.w(0xFF, 0x01); self.w(0x00, 0x00); self.w(0x91, 0x00); self.w(0x00, 0x01); self.w(0xFF, 0x00)


class TestVL53L0XPololuDriver(unittest.TestCase):
    def setUp(self):
        self.ns = 0
        self.due = None
        self.slave = VL53L0XSlave(lambda: self.ns, on_measurement_scheduled=self.schedule)
        self.host = Vl53l0xPololuHost(self.slave)
        self.host.init()

    def schedule(self, due_ns: int) -> None:
        self.due = due_ns

    def advance(self, ns: int) -> None:
        target = self.ns + ns
        while self.due is not None and self.due <= target:
            self.ns, self.due = self.due, None
            self.slave.tick(self.ns)
        self.ns = target

    def test_init_finds_eight_aperture_spads_and_the_stop_variable(self):
        self.assertEqual((self.host.spad_count, self.host.spad_is_aperture, self.host.spads_enabled), (8, True, 8))
        self.assertEqual(self.host.stop_variable, 0x3C)
        self.assertEqual(i2c_read_seq(self.slave, 0x13, 1), [0x00])

    def test_single_ranging_follows_the_driven_distance(self):
        self.assertEqual(self.host.read_single(), 100)
        self.slave.update(distance=1200)
        self.assertEqual(self.host.read_single(), 1200)
        self.slave.update(distance=2400)
        self.assertEqual(self.host.read_single(), 8190)

    def test_timed_continuous_ranging_then_stop(self):
        self.host.start_continuous(300)
        with self.assertRaises(TimeoutError):
            self.host.read_continuous()
        self.advance(30_000_000)
        self.assertEqual(self.host.read_continuous(), 100)
        self.slave.update(distance=640)
        self.advance(300_000_000)
        self.assertEqual(self.host.read_continuous(), 640)
        self.host.stop_continuous()
        # The library stops with a single-shot start, which leaves one result pending.
        self.assertEqual(self.host.read_continuous(), 640)
        self.advance(1_000_000_000)
        with self.assertRaises(TimeoutError):
            self.host.read_continuous()


def test_vl53l0x_rejects_an_unknown_i2c_event():
    with pytest.raises(ValueError, match='vl53l0x: unsupported I2C event 0x02'):
        VL53L0XSlave(lambda: 0).handle_event(0x02)
