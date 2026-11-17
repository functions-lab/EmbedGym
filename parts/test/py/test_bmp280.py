"""Unit tests for embedgym_parts/i2c/bmp280.py (BMP280Slave)."""
from __future__ import annotations

import unittest

import pytest

from embedgym_parts.i2c.bmp280 import BMP280Slave
from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_READ, I2C_START_RECV, I2C_START_SEND
from i2c_bus import i2c_read_seq, read_u16_le, write_event


class TestBMP280Slave(unittest.TestCase):

    def setUp(self):
        self.slave = BMP280Slave()

    # ── I2C protocol ───────────────────────────────────────────────────────────

    def test_ack_on_start_send(self):
        result = self.slave.handle_event(I2C_START_SEND)
        self.assertEqual(result, 0, 'I2C_START_SEND must return 0 (ACK)')

    def test_ack_on_start_recv(self):
        result = self.slave.handle_event(I2C_START_RECV)
        self.assertEqual(result, 0, 'I2C_START_RECV must return 0 (ACK)')

    def test_ack_on_write(self):
        self.slave.handle_event(I2C_START_SEND)
        result = self.slave.handle_event(write_event(0xD0))
        self.assertEqual(result, 0, 'WRITE must return 0 (ACK)')

    def test_finish_returns_zero(self):
        self.slave.handle_event(I2C_START_SEND)
        result = self.slave.handle_event(I2C_FINISH)
        self.assertEqual(result, 0)

    # ── Chip identity ──────────────────────────────────────────────────────────

    def test_chip_id_register_0xd0(self):
        chip_id = i2c_read_seq(self.slave, 0xD0, 1)[0]
        self.assertEqual(chip_id, 0x58, 'chip_id must be 0x58 for BMP280')

    # ── Calibration registers ──────────────────────────────────────────────────

    def test_calibration_t1_little_endian(self):
        # DIG_T1=27504 stored at 0x88 (LSB) and 0x89 (MSB)
        t1 = read_u16_le(self.slave.regs, 0x88)
        self.assertEqual(t1, BMP280Slave.DIG_T1)

    def test_calibration_p1_little_endian(self):
        p1 = read_u16_le(self.slave.regs, 0x8E)
        self.assertEqual(p1, BMP280Slave.DIG_P1)

    # ── Default measurement values ─────────────────────────────────────────────

    def test_default_temp_25c(self):
        """Default state: 25°C → compensated centidegrees ≈ 2500."""
        adc_t_bytes = i2c_read_seq(self.slave, 0xFA, 3)
        adc_t = ((adc_t_bytes[0] << 12) | (adc_t_bytes[1] << 4) | (adc_t_bytes[2] >> 4))
        compensated = self.slave._compensate_t(adc_t)
        # Allow ±1 centidegree tolerance (binary-search rounding)
        self.assertAlmostEqual(compensated, 2500, delta=1)

    def test_default_pressure_1013hpa(self):
        """Default state: 1013.25 hPa → compensated Pa within 100 Pa tolerance."""
        adc_t_bytes = i2c_read_seq(self.slave, 0xFA, 3)
        adc_t = ((adc_t_bytes[0] << 12) | (adc_t_bytes[1] << 4) | (adc_t_bytes[2] >> 4))
        adc_p_bytes = i2c_read_seq(self.slave, 0xF7, 3)
        adc_p = ((adc_p_bytes[0] << 12) | (adc_p_bytes[1] << 4) | (adc_p_bytes[2] >> 4))
        compensated_pa = self.slave._compensate_p(adc_p, adc_t)
        target_pa = 1013.25 * 100.0
        self.assertAlmostEqual(compensated_pa, target_pa, delta=100)  # ±1 hPa

    # ── update() changes ADC registers ────────────────────────────────────────

    def test_update_changes_temp_regs(self):
        before = list(self.slave.regs[0xFA:0xFD])
        self.slave.update(30.0, 1013.25)
        after = list(self.slave.regs[0xFA:0xFD])
        self.assertNotEqual(before, after, 'Temp ADC regs must change after update(30.0,...)')

    def test_update_changes_pressure_regs(self):
        before = list(self.slave.regs[0xF7:0xFA])
        self.slave.update(25.0, 900.0)
        after = list(self.slave.regs[0xF7:0xFA])
        self.assertNotEqual(before, after, 'Pressure ADC regs must change after update(...,900.0)')

    def test_update_temp_compensates_correctly(self):
        self.slave.update(40.0, 1013.25)
        adc_t_bytes = i2c_read_seq(self.slave, 0xFA, 3)
        adc_t = ((adc_t_bytes[0] << 12) | (adc_t_bytes[1] << 4) | (adc_t_bytes[2] >> 4))
        compensated = self.slave._compensate_t(adc_t)
        self.assertAlmostEqual(compensated, 4000, delta=1)

    # ── Sequential register reads ──────────────────────────────────────────────

    def test_sequential_read_advances_pointer(self):
        """Reading 3 bytes from 0xF7 must yield distinct pressure MSB/LSB/XLSB."""
        bytes_ = i2c_read_seq(self.slave, 0xF7, 3)
        self.assertEqual(len(bytes_), 3)
        # At least two of the three bytes must differ (non-trivial measurement)
        self.assertFalse(bytes_[0] == bytes_[1] == bytes_[2],
                         'All three pressure ADC bytes should not be identical')

    # ── State machine ─────────────────────────────────────────────────────────

    def test_write_sets_register_ptr(self):
        """Write-then-read: write reg address 0xD0, then read returns chip_id."""
        self.slave.handle_event(I2C_START_SEND)
        self.slave.handle_event(write_event(0xD0))   # set ptr to chip_id reg
        self.slave.handle_event(I2C_FINISH)
        self.slave.handle_event(I2C_START_RECV)
        val = self.slave.handle_event(I2C_READ)
        self.assertEqual(val, 0x58)

    def test_finish_resets_first_byte_flag(self):
        """After I2C_FINISH, the next transaction's first WRITE must set reg_ptr."""
        self.slave.handle_event(I2C_START_SEND)
        self.slave.handle_event(write_event(0xD0))
        self.slave.handle_event(I2C_FINISH)
        # New transaction: WRITE 0xD0 again → should set reg_ptr, not write data
        self.slave.handle_event(I2C_START_SEND)
        self.slave.handle_event(write_event(0xD0))
        self.slave.handle_event(I2C_FINISH)
        self.slave.handle_event(I2C_START_RECV)
        val = self.slave.handle_event(I2C_READ)
        self.assertEqual(val, 0x58, 'chip_id should still be 0x58 after I2C_FINISH + new transaction')


# ══════════════════════════════════════════════════════════════════════════════


def test_bmp280_rejects_an_unknown_i2c_event():
    with pytest.raises(ValueError, match='bmp280: unsupported I2C event 0x02'):
        BMP280Slave().handle_event(0x02)
