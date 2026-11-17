"""Unit tests for embedgym_parts/i2c/pmsa003i.py (PMSA003ISlave): the frontend-mirroring cases
over the picsimlab I2C event encoding, then the register-level cases."""
from __future__ import annotations

import unittest

import pytest

from esp32_i2c_slaves import I2C_FINISH, I2C_READ, I2C_START_RECV, I2C_START_SEND
from embedgym_parts.i2c.pmsa003i import PMSA003ISlave
from i2c_bus import write_event


# ─── PMSA003I (pmsa003i-frame.test.ts) ───────────────────────────────────────
# A register-less frame streamer: Adafruit_PM25AQI::read() is one 32-byte read
# transaction, validated by start byte and checksum; begin_I2C() is an empty
# write (the address probe).


# The frame for the power-on defaults 8 / 12 / 20 µg/m³, byte for byte.
PMSA003I_DEFAULT_FRAME = [
    0x42, 0x4D, 0x00, 0x1C,
    0x00, 0x08, 0x00, 0x0C, 0x00, 0x14,      # standard
    0x00, 0x08, 0x00, 0x0C, 0x00, 0x14,      # atmospheric
    0x00, 0xF0, 0x00, 0x48, 0x00, 0x18,      # particles > 0.3 / 0.5 / 1.0 µm
    0x00, 0x0A, 0x00, 0x04, 0x00, 0x02,      # particles > 2.5 / 5.0 / 10 µm
    0x00, 0x00,                              # version + error
    0x02, 0x5B,                              # checksum
]


def pm_read_frame(dev, n: int = 32) -> list[int]:
    """One master read transaction: I2C_START_RECV, n byte reads, STOP."""
    assert dev.handle_event(I2C_START_RECV) == 0
    out = [dev.handle_event(I2C_READ) for _ in range(n)]
    dev.handle_event(I2C_FINISH)
    return out


def pm_probe(dev) -> None:
    """The empty write Adafruit_BusIO's begin() sends: I2C_START_SEND, STOP."""
    assert dev.handle_event(I2C_START_SEND) == 0
    dev.handle_event(I2C_FINISH)


def pm_u16(frame: list[int], offset: int) -> int:
    return (frame[offset] << 8) | frame[offset + 1]


def test_pmsa003i_default_frame_is_byte_exact():
    dev = PMSA003ISlave()
    assert dev.addr == 0x12
    assert pm_read_frame(dev) == PMSA003I_DEFAULT_FRAME


def test_pmsa003i_frame_has_header_length_and_checksum():
    f = pm_read_frame(PMSA003ISlave())
    assert f[0] == 0x42 and f[1] == 0x4D
    assert pm_u16(f, 2) == 28
    assert pm_u16(f, 30) == sum(f[:30])


def test_pmsa003i_carries_the_driven_values_in_the_standard_fields():
    dev = PMSA003ISlave()
    dev.update(pm1_0=8, pm2_5=12, pm10=30)
    f = pm_read_frame(dev)
    assert [pm_u16(f, o) for o in (4, 6, 8)] == [8, 12, 30]
    assert [pm_u16(f, o) for o in (10, 12, 14)] == [8, 12, 30]   # equal up to 30 µg/m³


def test_pmsa003i_atmospheric_fields_fall_to_two_thirds_from_80_linearly_from_30():
    dev = PMSA003ISlave()
    dev.update(pm1_0=35, pm2_5=75, pm10=150)
    f = pm_read_frame(dev)
    assert [pm_u16(f, o) for o in (4, 6, 8)] == [35, 75, 150]
    assert [pm_u16(f, o) for o in (10, 12, 14)] == [32, 51, 100]
    assert pm_u16(f, 30) == sum(f[:30])
    dev.update(pm1_0=31, pm2_5=80, pm10=1000)
    f = pm_read_frame(dev)
    assert [pm_u16(f, o) for o in (10, 12, 14)] == [30, 53, 667]


def test_pmsa003i_encodes_big_endian():
    dev = PMSA003ISlave()
    dev.update(pm1_0=0, pm2_5=258, pm10=0)
    f = pm_read_frame(dev)
    assert f[6] == 0x01 and f[7] == 0x02


def test_pmsa003i_particle_counts_follow_the_avr_derivation():
    dev = PMSA003ISlave()
    dev.update(pm1_0=35, pm2_5=75, pm10=15)
    f = pm_read_frame(dev)
    # pm1 × 30, pm1 × 9, pm25 × 2, round(pm10 × 0.5 / 0.2 / 0.1) — JS Math.round, so 7.5 → 8.
    assert [pm_u16(f, o) for o in range(16, 28, 2)] == [1050, 315, 150, 8, 3, 2]


def test_pmsa003i_particle_counts_are_monotonic_in_the_concentrations():
    low, high = PMSA003ISlave(), PMSA003ISlave()
    low.update(pm1_0=5, pm2_5=10, pm10=15)
    high.update(pm1_0=50, pm2_5=100, pm10=150)
    fl, fh = pm_read_frame(low), pm_read_frame(high)
    for off in range(16, 28, 2):
        assert pm_u16(fh, off) > pm_u16(fl, off)


def test_pmsa003i_partial_update_keeps_the_other_values_and_rounds_like_js():
    dev = PMSA003ISlave()
    dev.update(pm2_5=75)
    f = pm_read_frame(dev)
    assert [pm_u16(f, o) for o in (4, 6, 8)] == [8, 75, 20]
    dev.update(pm1_0=8.5, pm10=20.4)
    f = pm_read_frame(dev)
    assert [pm_u16(f, o) for o in (4, 6, 8)] == [9, 75, 20]


def test_pmsa003i_stop_resets_the_pointer_and_a_long_read_wraps():
    dev = PMSA003ISlave()
    assert dev.handle_event(I2C_START_RECV) == 0
    for _ in range(5):
        dev.handle_event(I2C_READ)
    dev.handle_event(I2C_FINISH)
    assert pm_read_frame(dev, 2) == [0x42, 0x4D]
    assert pm_read_frame(dev, 33)[32] == 0x42


def test_pmsa003i_a_repeated_start_with_no_finish_reads_from_byte_0():
    dev = PMSA003ISlave()
    assert dev.handle_event(I2C_START_RECV) == 0
    for _ in range(5):
        dev.handle_event(I2C_READ)
    assert dev.handle_event(I2C_START_RECV) == 0
    assert [dev.handle_event(I2C_READ) for _ in range(2)] == [0x42, 0x4D]


def test_pmsa003i_acks_the_address_probe_without_disturbing_the_frame():
    dev = PMSA003ISlave()
    pm_probe(dev)
    assert pm_read_frame(dev) == PMSA003I_DEFAULT_FRAME
    # A repeated START (I2C_FINISH + I2C_START_RECV) after the probe reads from byte 0 too.
    assert dev.handle_event(I2C_START_SEND) == 0
    dev.handle_event(I2C_FINISH)
    assert pm_read_frame(dev, 2) == [0x42, 0x4D]


def test_pmsa003i_acks_a_data_write_and_keeps_serving_the_frame():
    # A register-style read (write 0x00, then read) is what i2c_burst_read sends.
    dev = PMSA003ISlave()
    assert dev.handle_event(I2C_START_SEND) == 0
    assert dev.handle_event(write_event(0x00)) == 0
    dev.handle_event(I2C_FINISH)
    assert pm_read_frame(dev) == PMSA003I_DEFAULT_FRAME


def test_pmsa003i_an_update_mid_read_shows_in_the_next_transaction():
    dev = PMSA003ISlave()
    dev.handle_event(I2C_START_RECV)
    head = [dev.handle_event(I2C_READ) for _ in range(4)]
    dev.update(pm1_0=35)
    rest = [dev.handle_event(I2C_READ) for _ in range(28)]
    dev.handle_event(I2C_FINISH)
    assert head + rest == PMSA003I_DEFAULT_FRAME
    assert pm_read_frame(dev)[4:6] == [0x00, 35]


def test_pmsa003i_rejects_out_of_range_and_non_finite_values_atomically():
    dev = PMSA003ISlave()
    with pytest.raises(ValueError, match='0–1000'):
        dev.update(pm1_0=-1)
    with pytest.raises(ValueError, match='0–1000'):
        dev.update(pm2_5=1001)
    with pytest.raises(ValueError, match='0–1000'):
        dev.update(pm10=float('nan'))
    with pytest.raises(ValueError, match='0–1000'):
        dev.update(pm1_0=35, pm2_5=2000)
    assert pm_read_frame(dev) == PMSA003I_DEFAULT_FRAME


class TestPMSA003ISlave(unittest.TestCase):
    """The 32-byte Plantower frame: layout, checksum, read pointer, one snapshot per transfer."""

    def setUp(self):
        self.slave = PMSA003ISlave()

    def read(self, n: int, start: bool = True) -> list[int]:
        if start:
            self.slave.handle_event(I2C_START_RECV)
        out = [self.slave.handle_event(I2C_READ) for _ in range(n)]
        self.slave.handle_event(I2C_FINISH)
        return out

    @staticmethod
    def u16(frame: list[int], offset: int) -> int:
        return (frame[offset] << 8) | frame[offset + 1]

    def assert_well_formed(self, frame: list[int]) -> None:
        self.assertEqual(frame[0:2], [0x42, 0x4D])
        self.assertEqual(self.u16(frame, 2), 28)
        self.assertEqual(self.u16(frame, 30), sum(frame[0:30]))

    def test_power_on_frame_carries_the_defaults(self):
        frame = self.read(32)
        self.assert_well_formed(frame)
        self.assertEqual([self.u16(frame, o) for o in (4, 6, 8)], [8, 12, 20])
        self.assertEqual([self.u16(frame, o) for o in (10, 12, 14)], [8, 12, 20])
        self.assertEqual(self.u16(frame, 28), 0)

    def test_frame_matches_the_frontend_model_byte_for_byte(self):
        self.slave.update(pm1_0=35, pm2_5=75, pm10=150)
        words = [28, 35, 75, 150, 32, 51, 100, 1050, 315, 150, 75, 30, 15, 0]
        body = [0x42, 0x4D] + [b for w in words for b in (w >> 8, w & 0xFF)]
        self.assertEqual(self.read(32), body + [sum(body) >> 8, sum(body) & 0xFF])

    def test_values_are_big_endian(self):
        self.slave.update(pm1_0=0, pm2_5=258, pm10=0)
        frame = self.read(32)
        self.assertEqual(frame[6:8], [0x01, 0x02])

    def test_fractions_round_half_up_as_math_round_does(self):
        self.slave.update(pm1_0=0.5, pm2_5=12.4, pm10=5)
        frame = self.read(32)
        self.assertEqual([self.u16(frame, o) for o in (4, 6, 8)], [1, 12, 5])
        self.assertEqual([self.u16(frame, o) for o in (22, 24, 26)], [3, 1, 1])
        self.assert_well_formed(frame)

    def test_particle_counts_are_monotonic_in_the_concentrations(self):
        self.slave.update(pm1_0=5, pm2_5=10, pm10=15)
        low = self.read(32)
        self.slave.update(pm1_0=50, pm2_5=100, pm10=150)
        high = self.read(32)
        for offset in range(16, 28, 2):
            self.assertGreater(self.u16(high, offset), self.u16(low, offset))

    def test_every_transfer_starts_at_the_header(self):
        self.assertEqual(self.read(4), [0x42, 0x4D, 0x00, 0x1C])
        self.assertEqual(self.read(1), [0x42])
        self.assertEqual(self.read(1), [0x42])
        self.assert_well_formed(self.read(32))

    def test_a_transfer_with_no_start_event_reads_the_same(self):
        self.assertEqual(self.read(4, start=False), [0x42, 0x4D, 0x00, 0x1C])
        self.assert_well_formed(self.read(32, start=False))

    def test_a_long_transfer_wraps_to_the_header(self):
        data = self.read(40)
        self.assertEqual(data[32:40], data[0:8])

    def test_an_update_during_a_transfer_shows_in_the_next_one(self):
        self.slave.handle_event(I2C_START_RECV)
        head = [self.slave.handle_event(I2C_READ) for _ in range(10)]
        self.slave.update(pm1_0=35, pm2_5=75, pm10=150)
        tail = [self.slave.handle_event(I2C_READ) for _ in range(22)]
        self.slave.handle_event(I2C_FINISH)
        frame = head + tail
        self.assert_well_formed(frame)
        self.assertEqual([self.u16(frame, o) for o in (4, 6, 8, 10, 12, 14)], [8, 12, 20, 8, 12, 20])
        frame = self.read(32)
        self.assert_well_formed(frame)
        self.assertEqual([self.u16(frame, o) for o in (4, 6, 8)], [35, 75, 150])

    def test_an_address_probe_with_no_data_is_acked(self):
        self.assertEqual(self.slave.handle_event(I2C_START_SEND), 0)
        self.assertEqual(self.slave.handle_event(I2C_FINISH), 0)
        self.assert_well_formed(self.read(32))

    def test_a_written_byte_is_acked_and_changes_nothing(self):
        before = self.read(32)
        self.slave.handle_event(I2C_START_SEND)
        self.assertEqual(self.slave.handle_event(write_event(0x00)), 0)
        self.assertEqual(self.slave.handle_event(write_event(0x55)), 0)
        self.slave.handle_event(I2C_FINISH)
        self.assertEqual(self.read(32), before)

    def test_a_register_byte_then_a_repeated_start_read_returns_the_frame_from_byte_0(self):
        # i2c_write_read / i2c_burst_read: the nRF binding sends no FINISH between
        # the phases and no START_RECV; QEMU sends both.
        for between in ((), (I2C_FINISH, I2C_START_RECV)):
            self.slave.handle_event(I2C_START_SEND)
            self.slave.handle_event(write_event(0x00))
            for event in between:
                self.slave.handle_event(event)
            frame = [self.slave.handle_event(I2C_READ) for _ in range(32)]
            self.slave.handle_event(I2C_FINISH)
            self.assert_well_formed(frame)
            self.assertEqual(self.read(4), [0x42, 0x4D, 0x00, 0x1C])

    def test_nack_ends_the_transfer(self):
        self.slave.handle_event(I2C_START_RECV)
        for _ in range(5):
            self.slave.handle_event(I2C_READ)
        self.slave.handle_event(0x04)  # I2C_NACK: the master's last-byte NACK
        self.assertEqual(self.read(2), [0x42, 0x4D])

    def test_update_rejects_out_of_range_values(self):
        for bad in (-1, 1001, float('nan'), float('inf')):
            for name in ('pm1_0', 'pm2_5', 'pm10'):
                values = {'pm1_0': 8, 'pm2_5': 12, 'pm10': 20, name: bad}
                with self.assertRaisesRegex(ValueError, name):
                    self.slave.update(**values)


def test_pmsa003i_rejects_an_unknown_i2c_event():
    with pytest.raises(ValueError, match='pmsa003i: unsupported I2C event 0x02'):
        PMSA003ISlave().handle_event(0x02)
