"""Unit tests for embedgym_parts/i2c/ds1307.py (DS1307Slave)."""
from __future__ import annotations

import unittest

import pytest

from embedgym_parts.i2c.ds1307 import DS1307Slave
from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_READ, I2C_START_RECV, I2C_START_SEND
from i2c_bus import (
    VirtualClock, bcd, bcd_valid, i2c_read_seq, i2c_write_seq, read_regs, read_time, write_event, write_regs,
    write_time,
)


def new_rtc() -> tuple[DS1307Slave, VirtualClock]:
    clock = VirtualClock()
    return DS1307Slave(clock), clock


def running_rtc() -> tuple[DS1307Slave, VirtualClock]:
    """A fresh part whose firmware cleared CH at virtual 0, leaving the time 00:00:00."""
    dev, clock = new_rtc()
    write_regs(dev, 0x00, 0x00)
    return dev, clock


def hours_12(hour: int, pm: bool) -> int:
    return 0x40 | (0x20 if pm else 0) | bcd(hour)


def test_ds1307_powers_on_halted_at_the_datasheet_contents():
    dev, clock = new_rtc()
    assert dev.addr == 0x68
    # CH set, 00:00:00, day 01, 01/01/00; control RS1:0 set; RAM 0.
    assert read_regs(dev, 0x00, 8) == [0x80, 0x00, 0x00, 0x01, 0x01, 0x01, 0x00, 0x03]
    assert read_regs(dev, 0x08, 56) == [0] * 56
    clock.seconds = 61.5
    assert read_regs(dev, 0x00, 3) == [0x80, 0x00, 0x00]


def test_ds1307_clearing_ch_starts_the_second_at_the_write():
    dev, clock = new_rtc()
    clock.seconds = 10.3
    write_regs(dev, 0x00, bcd(5))
    clock.seconds = 11.299
    assert read_time(dev)[0] == 5
    clock.seconds = 11.3
    assert read_time(dev)[0] == 6
    clock.seconds = 70.3
    assert read_time(dev)[:2] == (5, 1)


def test_ds1307_setting_ch_halts_and_holds_the_time():
    dev, clock = running_rtc()
    clock.seconds = 12.5
    write_regs(dev, 0x00, 0x80 | bcd(30))
    clock.seconds = 100
    assert read_regs(dev, 0x00, 2) == [0x80 | bcd(30), 0x00]
    write_regs(dev, 0x00, bcd(30))
    clock.seconds = 101
    assert read_time(dev)[:2] == (31, 0)


def test_ds1307_a_burst_read_latches_the_time_at_its_first_byte():
    dev, clock = running_rtc()
    clock.seconds = 59.9
    assert dev.handle_event(I2C_START_SEND) == 0
    assert dev.handle_event(write_event(0x00)) == 0
    dev.handle_event(I2C_FINISH)
    assert dev.handle_event(I2C_START_RECV) == 0
    first = dev.handle_event(I2C_READ)
    clock.seconds = 60.1                 # the second rolls over mid-burst
    rest = [dev.handle_event(I2C_READ) for _ in range(6)]
    dev.handle_event(I2C_FINISH)
    assert [first] + rest[:1] == [bcd(59), bcd(0)]
    assert read_time(dev)[:2] == (0, 1)


def test_ds1307_each_written_byte_lands_and_the_clock_ticks_from_the_seconds_write():
    dev, clock = new_rtc()
    clock.seconds = 0.5
    write_time(dev, 0, 37, 15, 2, 2, 2, 26)
    assert read_time(dev) == (0, 37, 15, 2, 2, 2, 26)
    clock.seconds = 1.499
    assert read_time(dev)[0] == 0
    clock.seconds = 1.5
    assert read_time(dev)[0] == 1
    clock.seconds = 60.5
    assert read_time(dev)[:3] == (0, 38, 15)


def test_ds1307_only_a_seconds_write_restarts_the_second():
    dev, clock = running_rtc()
    clock.seconds = 0.6
    write_regs(dev, 0x01, bcd(10))
    clock.seconds = 1.0
    assert read_time(dev)[:2] == (1, 10)
    clock.seconds = 1.6
    write_regs(dev, 0x00, bcd(30))
    clock.seconds = 2.599
    assert read_time(dev)[0] == 30
    clock.seconds = 2.6
    assert read_time(dev)[0] == 31


def test_ds1307_day_of_week_is_a_user_counter_that_increments_at_midnight():
    dev, clock = new_rtc()
    write_time(dev, 59, 59, 23, 5, 2, 2, 26)   # the written day is kept, whatever the date
    assert read_time(dev)[3] == 5
    clock.seconds = 1
    assert read_time(dev)[2:5] == (0, 6, 3)
    write_time(dev, 59, 59, 23, 7, 3, 2, 26)
    clock.seconds = 2
    assert read_time(dev)[3] == 1
    write_time(dev, 59, 59, 23, 0, 4, 2, 26)   # RTClib's adjust() writes day 0
    clock.seconds = 3
    assert read_time(dev)[3] == 1


def test_ds1307_12_hour_mode_counts_through_noon_and_midnight():
    dev, clock = new_rtc()
    write_regs(dev, 0x00, bcd(59), bcd(59), hours_12(11, False), 0x03, bcd(9), bcd(4), bcd(26))
    clock.seconds = 1
    assert read_regs(dev, 0x02, 1) == [hours_12(12, True)]
    write_regs(dev, 0x00, bcd(59), bcd(59), hours_12(12, True))
    clock.seconds = 2
    assert read_regs(dev, 0x02, 1) == [hours_12(1, True)]
    write_regs(dev, 0x00, bcd(59), bcd(59), hours_12(11, True))
    clock.seconds = 3
    assert read_regs(dev, 0x02, 3) == [hours_12(12, False), 0x04, bcd(10)]
    write_regs(dev, 0x00, bcd(59), bcd(59), hours_12(12, False))
    clock.seconds = 4
    assert read_regs(dev, 0x02, 3) == [hours_12(1, False), 0x04, bcd(10)]


def test_ds1307_rolls_over_into_a_leap_day_and_a_new_year():
    dev, clock = new_rtc()
    write_time(dev, 59, 59, 23, 6, 28, 2, 28)
    clock.seconds = 1
    assert read_time(dev) == (0, 0, 0, 7, 29, 2, 28)
    write_time(dev, 59, 59, 23, 6, 28, 2, 27)
    clock.seconds = 2
    assert read_time(dev)[4:] == (1, 3, 27)
    write_time(dev, 59, 59, 23, 7, 31, 12, 99)
    clock.seconds = 3
    assert read_time(dev) == (0, 0, 0, 1, 1, 1, 0)


def test_ds1307_partial_write_keeps_the_other_fields():
    dev, _ = new_rtc()
    write_time(dev, 30, 37, 15, 2, 2, 2, 26)
    write_regs(dev, 0x02, bcd(7))
    assert read_time(dev) == (30, 37, 7, 2, 2, 2, 26)


def test_ds1307_pointer_only_write_changes_nothing():
    dev, clock = new_rtc()
    clock.seconds = 5
    write_regs(dev, 0x02)
    assert read_regs(dev, 0x00, 7) == [0x80, 0x00, 0x00, 0x01, 0x01, 0x01, 0x00]


@pytest.mark.parametrize('reg, value', [
    (0x00, 0x5A), (0x00, 0x60), (0x01, 0x60), (0x02, 0x24), (0x02, 0x1A),
    (0x02, 0x40), (0x02, 0x53), (0x04, 0x00), (0x04, 0x32), (0x05, 0x00),
    (0x05, 0x13), (0x06, 0xA0), (0x06, 0x0A),
])
def test_ds1307_an_illogical_time_write_raises(reg, value):
    dev, _ = new_rtc()
    with pytest.raises(ValueError, match='is not BCD'):
        write_regs(dev, reg, value)


def test_ds1307_counting_on_from_a_date_past_its_month_raises():
    dev, clock = new_rtc()
    write_time(dev, 59, 59, 23, 1, 29, 2, 27)   # 29 February of a common year
    clock.seconds = 0.5
    assert read_time(dev)[4] == 29
    clock.seconds = 1
    with pytest.raises(ValueError, match='ds1307: cannot count on from date 29 of month 2'):
        read_time(dev)


def test_ds1307_set_epoch_uses_utc_fields_and_the_given_park_time():
    dev, clock = running_rtc()
    clock.seconds = 1.7009   # the post-park clock overshoot
    dev.set_epoch(1907742600, at_seconds=1.7)   # 2030-06-15 08:30:00 UTC, a Saturday
    assert read_time(dev) == (0, 30, 8, 7, 15, 6, 30)
    clock.seconds = 2.6999
    assert read_time(dev)[0] == 0
    clock.seconds = 2.7001
    assert read_time(dev)[0] == 1


def test_ds1307_set_epoch_mid_burst_shows_at_the_next_start():
    dev, clock = running_rtc()
    assert dev.handle_event(I2C_START_SEND) == 0
    assert dev.handle_event(write_event(0x00)) == 0
    dev.handle_event(I2C_FINISH)
    assert dev.handle_event(I2C_START_RECV) == 0
    assert dev.handle_event(I2C_READ) == 0x00
    dev.set_epoch(1907742600)   # 08:30:00
    assert dev.handle_event(I2C_READ) == 0x00   # minutes from the transaction's latch
    dev.handle_event(I2C_FINISH)
    assert read_time(dev)[:3] == (0, 30, 8)


def test_ds1307_set_epoch_defaults_to_now():
    dev, clock = running_rtc()
    clock.seconds = 10
    dev.set_epoch(1907742600)
    clock.seconds = 11
    assert read_time(dev)[0] == 1


def test_ds1307_set_epoch_keeps_ch_and_the_12_hour_mode():
    dev, clock = new_rtc()
    dev.set_epoch(1907742600 + 6 * 3600)   # 14:30:00 UTC
    assert read_regs(dev, 0x00, 3) == [0x80, bcd(30), bcd(14)]
    clock.seconds = 5
    assert read_regs(dev, 0x00, 1) == [0x80]
    write_regs(dev, 0x02, hours_12(1, False))
    dev.set_epoch(1907742600 + 6 * 3600)
    assert read_regs(dev, 0x02, 1) == [hours_12(2, True)]


def test_ds1307_set_running_clears_ch_and_starts_the_second_at_the_given_park_time():
    dev, clock = new_rtc()
    dev.set_epoch(1907742600)   # 08:30:00, still halted
    clock.seconds = 5.0009
    dev.set_running(True, at_seconds=5.0)
    assert read_regs(dev, 0x00, 3) == [0x00, bcd(30), bcd(8)]
    clock.seconds = 5.9999
    assert read_time(dev)[0] == 0
    clock.seconds = 6.0001
    assert read_time(dev)[0] == 1
    clock.seconds = 66
    assert read_time(dev)[:3] == (1, 31, 8)


def test_ds1307_set_running_true_on_a_running_clock_keeps_its_second():
    dev, clock = running_rtc()
    clock.seconds = 3.5
    dev.set_running(True)
    clock.seconds = 4
    assert read_time(dev)[0] == 4


def test_ds1307_set_running_false_holds_the_time_counted_up_to_the_park():
    dev, clock = running_rtc()
    clock.seconds = 7.0009
    dev.set_running(False, at_seconds=6.9999)
    clock.seconds = 100
    assert read_regs(dev, 0x00, 2) == [0x80 | bcd(6), 0x00]
    dev.set_running(False)
    assert read_regs(dev, 0x00, 1) == [0x80 | bcd(6)]


def test_ds1307_pointer_survives_the_repeated_start_and_wraps_at_0x40():
    dev, _ = new_rtc()
    assert dev.handle_event(I2C_START_SEND) == 0
    assert dev.handle_event(write_event(0x05)) == 0
    dev.handle_event(I2C_FINISH)
    assert dev.handle_event(I2C_START_RECV) == 0
    assert dev.handle_event(I2C_READ) == bcd(1)   # month
    assert dev.handle_event(I2C_READ) == bcd(0)   # year
    assert dev.handle_event(I2C_READ) == 0x03     # control
    dev.handle_event(I2C_FINISH)
    assert read_regs(dev, 0x3F, 2) == [0x00, 0x80]  # the last RAM byte, then seconds with CH
    assert dev.reg_ptr == 0x01


def test_ds1307_ram_holds_what_is_written_and_a_write_wraps_into_the_clock():
    dev, _ = new_rtc()
    data = list(range(0x10, 0x10 + 56))
    write_regs(dev, 0x08, *data)
    assert read_regs(dev, 0x08, 56) == data
    write_regs(dev, 0x3F, 0xAB, bcd(12))   # 0x3F, then seconds: CH cleared
    assert read_regs(dev, 0x3F, 2) == [0xAB, bcd(12)]


def test_ds1307_control_register_stores_out_sqwe_and_rs():
    dev, _ = new_rtc()
    write_regs(dev, 0x07, 0xFF)
    assert read_regs(dev, 0x07, 1) == [0x93]
    write_regs(dev, 0x07, 0x10)   # SQWE at 1 Hz, as Zephyr's driver writes it
    assert read_regs(dev, 0x07, 1) == [0x10]


def test_ds1307_register_address_past_0x3f_raises():
    dev, _ = new_rtc()
    assert dev.handle_event(I2C_START_SEND) == 0
    with pytest.raises(ValueError, match='ds1307: register address 0x40 is past the last register'):
        dev.handle_event(write_event(0x40))


class TestDS1307Slave(unittest.TestCase):

    def setUp(self):
        self.slave = DS1307Slave(lambda: 0.0)

    def test_ack_on_start_send(self):
        self.assertEqual(self.slave.handle_event(I2C_START_SEND), 0)

    def test_ack_on_write(self):
        self.slave.handle_event(I2C_START_SEND)
        self.assertEqual(self.slave.handle_event(write_event(0x00)), 0)

    def test_seconds_is_valid_bcd(self):
        seconds = i2c_read_seq(self.slave, 0x00, 1)[0] & 0x7F   # bit 7 is CH
        tens  = (seconds >> 4) & 0xF
        units =  seconds       & 0xF
        self.assertLessEqual(tens,  5, 'Seconds tens digit must be ≤ 5')
        self.assertLessEqual(units, 9, 'Seconds units digit must be ≤ 9')

    def test_minutes_is_valid_bcd(self):
        minutes = i2c_read_seq(self.slave, 0x01, 1)[0]
        self.assertLessEqual((minutes >> 4) & 0xF, 5)
        self.assertLessEqual( minutes       & 0xF, 9)

    def test_hours_is_valid_bcd(self):
        hours = i2c_read_seq(self.slave, 0x02, 1)[0]
        # BCD 00–23
        tens  = (hours >> 4) & 0xF
        units =  hours       & 0xF
        value = tens * 10 + units
        self.assertGreaterEqual(value, 0)
        self.assertLessEqual(value, 23)

    def test_year_is_valid_bcd(self):
        year = i2c_read_seq(self.slave, 0x06, 1)[0]
        self.assertTrue(bcd_valid(year), f'Year 0x{year:02X} is not valid BCD')

    def test_sequential_read_7_regs(self):
        """Read all 7 time registers in one transaction — all must be valid BCD."""
        data = i2c_read_seq(self.slave, 0x00, 7)
        self.assertEqual(len(data), 7)
        for i, b in enumerate(data):
            self.assertTrue(bcd_valid(b & 0x7F), f'Register {i} value 0x{b:02X} is not valid BCD')


class TestDS1307Clock(unittest.TestCase):
    """The clock on an injected time source: set, tick, latch, epoch."""

    # 2026/02/02 15:37:00, day 1 of the week, CH clear
    SET = [0x00, 0x37, 0x15, 0x01, 0x02, 0x02, 0x26]

    def setUp(self):
        self.ns = 0
        self.slave = DS1307Slave(lambda: self.ns / 1e9)

    def advance(self, seconds: float) -> None:
        self.ns += int(seconds * 1_000_000_000)

    def test_written_time_reads_back(self):
        i2c_write_seq(self.slave, 0x00, self.SET)
        self.assertEqual(i2c_read_seq(self.slave, 0x00, 7), self.SET)

    def test_ticks_on_the_injected_clock_only(self):
        self.advance(5.2)
        i2c_write_seq(self.slave, 0x00, self.SET)
        self.advance(0.999)
        self.assertEqual(i2c_read_seq(self.slave, 0x00, 1), [0x00])
        self.advance(0.001)
        self.assertEqual(i2c_read_seq(self.slave, 0x00, 1), [0x01])
        self.advance(59)
        self.assertEqual(i2c_read_seq(self.slave, 0x00, 2), [0x00, 0x38])

    def test_burst_read_is_latched_at_its_first_byte(self):
        i2c_write_seq(self.slave, 0x00, [0x59] + self.SET[1:])
        self.slave.handle_event(I2C_START_SEND)
        self.slave.handle_event(write_event(0x00))
        self.slave.handle_event(I2C_START_RECV)
        seconds = self.slave.handle_event(I2C_READ)
        self.advance(1)
        minutes = self.slave.handle_event(I2C_READ)
        self.slave.handle_event(I2C_FINISH)
        self.assertEqual([seconds, minutes], [0x59, 0x37])
        self.assertEqual(i2c_read_seq(self.slave, 0x00, 2), [0x00, 0x38])

    def test_read_without_a_pointer_write_continues(self):
        i2c_write_seq(self.slave, 0x00, self.SET)
        i2c_read_seq(self.slave, 0x00, 1)
        self.slave.handle_event(I2C_START_RECV)
        self.assertEqual(self.slave.handle_event(I2C_READ), 0x37)
        self.slave.handle_event(I2C_FINISH)

    def test_set_epoch_sets_utc_fields(self):
        i2c_write_seq(self.slave, 0x00, [0x00])
        self.slave.set_epoch(1907742600)   # 2030/06/15 08:30:00 UTC, a Saturday
        self.advance(1.5)
        self.assertEqual(i2c_read_seq(self.slave, 0x00, 7), [0x01, 0x30, 0x08, 0x07, 0x15, 0x06, 0x30])

    def test_set_epoch_keeps_the_two_digit_year(self):
        i2c_write_seq(self.slave, 0x00, [0x00])
        self.slave.set_epoch(0)
        self.assertEqual(i2c_read_seq(self.slave, 0x00, 7), [0x00, 0x00, 0x00, 0x05, 0x01, 0x01, 0x70])

    def test_power_on_clock_does_not_tick(self):
        self.advance(2)
        self.assertEqual(i2c_read_seq(self.slave, 0x00, 7), [0x80, 0x00, 0x00, 0x01, 0x01, 0x01, 0x00])


# ══════════════════════════════════════════════════════════════════════════════


def test_ds1307_rejects_an_unknown_i2c_event():
    with pytest.raises(ValueError, match='ds1307: unsupported I2C event 0x02'):
        DS1307Slave(lambda: 0.0).handle_event(0x02)
