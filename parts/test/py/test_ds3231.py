"""Unit tests for embedgym_parts/i2c/ds3231.py (DS3231Slave)."""
from __future__ import annotations

import unittest

import pytest

from embedgym_parts.i2c.ds3231 import DS3231Slave
from i2c_bus import VirtualClock, bcd_valid, i2c_read_seq, i2c_write_seq, read_regs, read_time, write_time


def test_ds3231_shares_the_clock_and_adds_temperature():
    clock = VirtualClock()
    dev = DS3231Slave(clock)
    dev.temperatureC = 25.75
    assert read_regs(dev, 0x11, 2) == [25, 0xC0]
    write_time(dev, 0, 37, 15, 2, 2, 2, 26)
    clock.seconds = 2
    assert read_time(dev) == (2, 37, 15, 2, 2, 2, 26)


class TestDS3231Slave(unittest.TestCase):

    def setUp(self):
        self.slave = DS3231Slave(lambda: 0.0)

    def test_inherits_time_registers(self):
        """DS3231 regs 0–6 must return the same valid BCD as DS1307."""
        data = i2c_read_seq(self.slave, 0x00, 7)
        self.assertEqual(len(data), 7)
        for i, b in enumerate(data):
            self.assertTrue(bcd_valid(b), f'Register {i} value 0x{b:02X} is not valid BCD')

    def test_time_is_settable_and_has_no_halt_bit(self):
        ns = [0]
        slave = DS3231Slave(lambda: ns[0] / 1e9)
        i2c_write_seq(slave, 0x00, [0x80 | 0x58, 0x37, 0x15, 0x01, 0x02, 0x02, 0x26])
        ns[0] = 3_000_000_000
        self.assertEqual(i2c_read_seq(slave, 0x00, 3), [0x01, 0x38, 0x15])

    def test_control_register_0x0e(self):
        val = self.slave._read_reg(0x0E)
        self.assertEqual(val, 0x00)

    def test_status_register_0x0f(self):
        val = self.slave._read_reg(0x0F)
        self.assertEqual(val, 0x00)

    def test_temperature_msb_default_25c(self):
        val = self.slave._read_reg(0x11)
        self.assertEqual(val, 25, 'Temp MSB must be 25 (integer °C) at default 25.0°C')

    def test_temperature_lsb_zero_frac(self):
        val = self.slave._read_reg(0x12)
        self.assertEqual(val, 0, 'Temp LSB must be 0 when fractional part is .00')

    def test_temperature_update_quarter_degree(self):
        """25.25°C → LSB bits 7:6 == 0b01 (0.25°C step)."""
        self.slave.temperatureC = 25.25
        msb = self.slave._read_reg(0x11)
        lsb = self.slave._read_reg(0x12)
        self.assertEqual(msb, 25)
        frac_bits = (lsb >> 6) & 0x03
        self.assertEqual(frac_bits, 1, '0.25°C → bits 7:6 must be 0b01')

    def test_temperature_update_half_degree(self):
        """25.5°C → LSB bits 7:6 == 0b10 (0.50°C step)."""
        self.slave.temperatureC = 25.5
        lsb = self.slave._read_reg(0x12)
        frac_bits = (lsb >> 6) & 0x03
        self.assertEqual(frac_bits, 2, '0.50°C → bits 7:6 must be 0b10')

    def test_temperature_read_via_i2c(self):
        """Temperature registers are accessible via I2C READ from 0x11."""
        self.slave.temperatureC = 30.0
        data = i2c_read_seq(self.slave, 0x11, 2)
        self.assertEqual(data[0], 30)   # MSB = integer °C
        self.assertEqual(data[1], 0)    # LSB = 0 (no fractional part)


# ══════════════════════════════════════════════════════════════════════════════


def test_ds3231_rejects_an_unknown_i2c_event():
    with pytest.raises(ValueError, match='ds1307: unsupported I2C event 0x02'):
        DS3231Slave(lambda: 0.0).handle_event(0x02)
