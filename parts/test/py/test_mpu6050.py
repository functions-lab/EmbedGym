"""Unit tests for embedgym_parts/i2c/mpu6050.py (MPU6050Slave)."""
from __future__ import annotations

import unittest

import pytest

from embedgym_parts.i2c.mpu6050 import MPU6050Slave
from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_READ, I2C_START_RECV, I2C_START_SEND
from i2c_bus import i2c_read_seq, read_regs, write_event


def write_reg(dev: MPU6050Slave, reg: int, value: int) -> None:
    """One write transaction: START, register pointer, data byte, STOP."""
    assert dev.handle_event(I2C_START_SEND) == 0
    assert dev.handle_event(write_event(reg)) == 0
    assert dev.handle_event(write_event(value)) == 0
    dev.handle_event(I2C_FINISH)


def read_i16(dev: MPU6050Slave, reg: int) -> int:
    hi, lo = read_regs(dev, reg, 2)
    raw = (hi << 8) | lo
    return raw - 0x10000 if raw & 0x8000 else raw


def awake(dev: MPU6050Slave | None = None) -> MPU6050Slave:
    """The part with SLEEP cleared, as every driver's init does."""
    dev = dev or MPU6050Slave()
    write_reg(dev, 0x6B, 0x00)
    return dev


def test_who_am_i():
    assert read_regs(MPU6050Slave(), 0x75, 1) == [0x68]


def test_power_on_is_asleep_with_data_registers_at_their_reset_value():
    dev = MPU6050Slave()
    assert read_regs(dev, 0x6B, 2) == [0x40, 0x00]
    dev.update(accel_x=0.5, gyro_x=-50, temp=30)
    assert read_regs(dev, 0x3B, 14) == [0] * 14


def test_waking_samples_the_part_lying_flat_at_25c():
    dev = awake()
    burst = read_regs(dev, 0x3B, 14)
    assert burst[0:6] == [0, 0, 0, 0, 0x40, 0x00]        # accel X/Y/Z = 0, 0, +1 g
    assert burst[8:14] == [0, 0, 0, 0, 0, 0]              # gyro stationary
    temp_raw = ((burst[6] << 8) | burst[7]) - 0x10000
    assert round(temp_raw / 340 + 36.53, 1) == 25.0


def test_update_scales_at_default_full_scale():
    dev = awake()
    dev.update(accel_x=0.5, accel_z=1, gyro_x=-50, gyro_y=100)
    assert read_i16(dev, 0x3B) == 8192
    assert read_i16(dev, 0x3F) == 16384
    assert read_i16(dev, 0x43) == -6550
    assert read_i16(dev, 0x45) == 13100


def test_config_writes_rescale_outputs():
    dev = awake()
    dev.update(accel_x=-3, accel_z=2.5, gyro_y=200)
    write_reg(dev, 0x1B, 0x08)  # GYRO_CONFIG FS_SEL=1: ±500 deg/s
    write_reg(dev, 0x1C, 0x08)  # ACCEL_CONFIG AFS_SEL=1: ±4 g
    assert read_i16(dev, 0x3B) == -24576
    assert read_i16(dev, 0x3F) == 20480
    assert read_i16(dev, 0x45) == 13100
    write_reg(dev, 0x1C, 0x18)  # ±16 g
    assert read_i16(dev, 0x3F) == 2.5 * 2048


def test_values_beyond_full_scale_saturate():
    dev = awake()
    dev.update(accel_z=2.5, gyro_x=300)
    assert read_i16(dev, 0x3F) == 32767
    assert read_i16(dev, 0x43) == 32767
    dev.update(accel_z=-3)
    assert read_i16(dev, 0x3F) == -32768


def test_temperature_formula():
    dev = awake()
    dev.update(temp=30)
    # (30 - 36.53) * 340 = -2220.2 → -2220
    assert read_i16(dev, 0x41) == -2220


def test_rounding_matches_js_math_round():
    dev = awake()
    dev.update(gyro_x=1.5)  # 196.5: JS Math.round → 197, Python round → 196
    assert read_i16(dev, 0x43) == 197


def test_device_reset_self_clears_and_restores_defaults():
    dev = awake()
    write_reg(dev, 0x1C, 0x18)  # ±16 g
    assert read_regs(dev, 0x3F, 1) == [0x08]  # +1 g at ±16 g = 2048
    write_reg(dev, 0x6B, 0x80)
    assert read_regs(dev, 0x6B, 1) == [0x40]  # back asleep
    assert read_regs(dev, 0x75, 1) == [0x68]
    assert read_regs(dev, 0x1C, 1) == [0x00]
    assert read_regs(dev, 0x3F, 2) == [0x00, 0x00]
    awake(dev)
    assert read_regs(dev, 0x3F, 2) == [0x40, 0x00]


def test_signal_path_reset_self_clears():
    dev = MPU6050Slave()
    write_reg(dev, 0x68, 0x07)
    assert read_regs(dev, 0x68, 1) == [0x00]


def test_plain_register_writes_are_stored():
    dev = MPU6050Slave()
    write_reg(dev, 0x19, 0x07)  # SMPLRT_DIV
    write_reg(dev, 0x1A, 0x03)  # CONFIG (DLPF)
    write_reg(dev, 0x6B, 0x01)  # PWR_MGMT_1: PLL with X gyro reference
    assert read_regs(dev, 0x19, 2) == [0x07, 0x03]
    assert read_regs(dev, 0x6B, 1) == [0x01]


def test_burst_read_after_drive_is_14_bytes_from_0x3b():
    dev = awake()
    dev.update(accel_z=0.25, gyro_x=-50)
    burst = read_regs(dev, 0x3B, 14)
    assert len(burst) == 14
    assert (burst[4] << 8) | burst[5] == 4096
    assert ((burst[8] << 8) | burst[9]) - 0x10000 == -6550


def test_sleeping_again_holds_the_last_sample():
    dev = awake()
    dev.update(accel_x=0.5)
    write_reg(dev, 0x6B, 0x40)
    dev.update(accel_x=-1, gyro_z=100)
    write_reg(dev, 0x1C, 0x08)  # a range change while asleep samples nothing either
    assert read_i16(dev, 0x3B) == 8192
    assert read_i16(dev, 0x47) == 0
    write_reg(dev, 0x6B, 0x00)
    assert read_i16(dev, 0x3B) == -8192
    assert read_i16(dev, 0x47) == 13100


def test_clksel_7_stops_sampling():
    dev = awake()
    write_reg(dev, 0x6B, 0x07)
    dev.update(accel_x=0.5)
    assert read_i16(dev, 0x3B) == 0
    write_reg(dev, 0x6B, 0x01)
    assert read_i16(dev, 0x3B) == 8192


def test_temp_dis_holds_only_the_temperature():
    dev = awake()
    write_reg(dev, 0x6B, 0x08)
    dev.update(accel_x=0.5, temp=30)
    assert read_i16(dev, 0x3B) == 8192
    assert round(read_i16(dev, 0x41) / 340 + 36.53, 1) == 25.0
    write_reg(dev, 0x6B, 0x00)
    assert read_i16(dev, 0x41) == -2220


def test_pwr_mgmt_2_standby_holds_each_axis():
    dev = awake()
    write_reg(dev, 0x6C, 0x24)  # STBY_XA, STBY_XG
    dev.update(accel_x=0.5, accel_y=0.25, gyro_x=100, gyro_y=-50)
    assert read_i16(dev, 0x3B) == 0
    assert read_i16(dev, 0x3D) == 4096
    assert read_i16(dev, 0x43) == 0
    assert read_i16(dev, 0x45) == -6550
    write_reg(dev, 0x6C, 0x00)
    assert read_i16(dev, 0x3B) == 8192
    assert read_i16(dev, 0x43) == 13100


def test_cycle_mode_raises_unless_asleep():
    dev = MPU6050Slave()
    write_reg(dev, 0x6B, 0x60)  # CYCLE with SLEEP: SLEEP wins
    assert read_regs(dev, 0x6B, 1) == [0x60]
    with pytest.raises(ValueError, match='mpu6050: cycle mode'):
        write_reg(dev, 0x6B, 0x20)


@pytest.mark.parametrize('clksel', [4, 5, 6])
def test_external_and_reserved_clock_sources_raise(clksel):
    with pytest.raises(ValueError, match=f'mpu6050: CLKSEL {clksel}'):
        write_reg(MPU6050Slave(), 0x6B, clksel)


class TestMPU6050Slave(unittest.TestCase):

    def setUp(self):
        self.mpu = awake()

    def test_who_am_i_default_addr(self):
        """WHO_AM_I register (0x75) must return 0x68."""
        result = i2c_read_seq(self.mpu, 0x75, 1)
        self.assertEqual(result[0], 0x68)

    def test_start_send_ack(self):
        """I2C_START_SEND event must return 0 (ACK)."""
        self.assertEqual(self.mpu.handle_event(I2C_START_SEND), 0)

    def test_start_recv_ack(self):
        """I2C_START_RECV event must return 0 (ACK)."""
        self.assertEqual(self.mpu.handle_event(I2C_START_RECV), 0)

    def test_write_then_read_who_am_i(self):
        """Full write-then-read: write reg 0x75, then read returns 0x68."""
        m = MPU6050Slave()
        m.handle_event(I2C_START_SEND)           # beginTransmission
        m.handle_event(write_event(0x75))           # write register address
        m.handle_event(I2C_FINISH)                # RSTART
        m.handle_event(I2C_START_RECV)            # requestFrom
        result = m.handle_event(I2C_READ)         # read byte
        self.assertEqual(result, 0x68, f"WHO_AM_I must be 0x68, got 0x{result:02x}")

    def test_detected_pattern(self):
        """detected() pattern: I2C_START_SEND then I2C_FINISH (no data bytes) returns ACK."""
        m = MPU6050Slave()
        # beginTransmission + endTransmission (no data)
        r1 = m.handle_event(I2C_START_SEND)
        self.assertEqual(r1, 0, "I2C_START_SEND must return 0 (ACK) for detected()")
        r2 = m.handle_event(I2C_FINISH)
        self.assertEqual(r2, 0, "I2C_FINISH must return 0")

    def test_accel_z_default_1g(self):
        """ACCEL_Z should default to +1g = 0x4000 (MSB=0x40, LSB=0x00)."""
        result = i2c_read_seq(self.mpu, 0x3F, 2)
        accel_z = (result[0] << 8) | result[1]
        self.assertEqual(accel_z, 0x4000, f"Expected ACCEL_Z=0x4000, got 0x{accel_z:04x}")

    def test_update_accel(self):
        """update() must reflect new accel values in register reads."""
        self.mpu.update(accel_x=1.0, accel_y=0.0, accel_z=0.0)
        result = i2c_read_seq(self.mpu, 0x3B, 2)
        accel_x = (result[0] << 8) | result[1]
        # 1g at ±2g full-scale = 16384 = 0x4000
        self.assertEqual(accel_x, 0x4000)

    def test_sequential_read_14_bytes(self):
        """getEvent() reads 14 bytes from 0x3B — all must come from correct regs."""
        result = i2c_read_seq(self.mpu, 0x3B, 14)
        self.assertEqual(len(result), 14)
        expected = list(self.mpu.regs[0x3B:0x3B + 14])
        self.assertEqual(result, expected, "14-byte read from 0x3B must match register map")

    def test_device_reset_bit_auto_cleared(self):
        """Writing 0x80 to PWR_MGMT_1 (0x6B) must auto-clear bit 7 immediately."""
        self.mpu.handle_event(I2C_START_SEND)
        self.mpu.handle_event(write_event(0x6B))   # register address
        self.mpu.handle_event(write_event(0x80))   # write 0x80 (DEVICE_RESET bit)
        self.mpu.handle_event(I2C_FINISH)
        # Read back: bit 7 should be 0 (auto-cleared)
        result = i2c_read_seq(self.mpu, 0x6B, 1)
        self.assertEqual(result[0] & 0x80, 0, "DEVICE_RESET bit must auto-clear")

    def test_alternate_address(self):
        """MPU6050 at address 0x69 (AD0=HIGH) must still return WHO_AM_I=0x68."""
        mpu69 = MPU6050Slave(addr=0x69)
        result = i2c_read_seq(mpu69, 0x75, 1)
        self.assertEqual(result[0], 0x68)

    def test_reg_ptr_preserved_across_rstart(self):
        """Write sets reg_ptr; I2C_FINISH then I2C_START_RECV should NOT reset reg_ptr."""
        m = MPU6050Slave()
        m.handle_event(I2C_START_SEND)
        m.handle_event(write_event(0x75))   # set reg_ptr = 0x75
        m.handle_event(I2C_FINISH)        # RSTART — must NOT reset reg_ptr
        m.handle_event(I2C_START_RECV)    # read direction START
        val = m.handle_event(I2C_READ)
        self.assertEqual(val, 0x68, "reg_ptr must be preserved across RSTART")

    def test_write_to_reg(self):
        """Writing two bytes sets reg address then reg value."""
        m = MPU6050Slave()
        m.handle_event(I2C_START_SEND)
        m.handle_event(write_event(0x6B))   # reg address
        m.handle_event(write_event(0x01))   # value
        m.handle_event(I2C_FINISH)
        result = i2c_read_seq(m, 0x6B, 1)
        self.assertEqual(result[0], 0x01)

    def write_reg(self, reg: int, value: int) -> None:
        self.mpu.handle_event(I2C_START_SEND)
        self.mpu.handle_event(write_event(reg))
        self.mpu.handle_event(write_event(value))
        self.mpu.handle_event(I2C_FINISH)

    def read_i16(self, reg: int) -> int:
        hi, lo = i2c_read_seq(self.mpu, reg, 2)
        raw = (hi << 8) | lo
        return raw - 0x10000 if raw & 0x8000 else raw

    def test_accel_full_scale_every_range(self):
        """ACCEL_CONFIG AFS_SEL 0..3 scales 1 g to 16384/8192/4096/2048."""
        for afs_sel, lsb_per_g in enumerate((16384, 8192, 4096, 2048)):
            self.write_reg(0x1C, afs_sel << 3)
            self.assertEqual(self.read_i16(0x3F), lsb_per_g)

    def test_gyro_full_scale_every_range(self):
        """GYRO_CONFIG FS_SEL 0..3 scales 100 °/s to 13100/6550/3275/1638."""
        self.mpu.update(gyro_x=100.0)
        for fs_sel, raw in enumerate((13100, 6550, 3275, 1638)):
            self.write_reg(0x1B, fs_sel << 3)
            self.assertEqual(self.read_i16(0x43), raw)

    def test_update_after_config_uses_selected_range(self):
        self.write_reg(0x1C, 1 << 3)
        self.mpu.update(accel_x=-1.5, accel_z=0.0)
        self.assertEqual(self.read_i16(0x3B), -12288)

    def test_config_after_update_rescales_stored_value(self):
        self.mpu.update(accel_x=-1.5, accel_z=0.0)
        self.assertEqual(self.read_i16(0x3B), -24576)
        self.write_reg(0x1C, 1 << 3)
        self.assertEqual(self.read_i16(0x3B), -12288)

    def test_config_written_in_a_burst_with_gyro_config(self):
        """One transaction writing 0x1B then 0x1C (auto-increment) sets both ranges."""
        self.mpu.update(gyro_x=100.0)
        self.mpu.handle_event(I2C_START_SEND)
        for byte in (0x1B, 3 << 3, 2 << 3):
            self.mpu.handle_event(write_event(byte))
        self.mpu.handle_event(I2C_FINISH)
        self.assertEqual(self.read_i16(0x43), 1638)
        self.assertEqual(self.read_i16(0x3F), 4096)

    def test_temperature_independent_of_full_scale(self):
        self.mpu.update(temp=36.53 + 10)
        self.write_reg(0x1C, 3 << 3)
        self.assertEqual(self.read_i16(0x41), 3400)

    def test_device_reset_restores_default_range_and_keeps_motion(self):
        self.mpu.update(accel_x=1.0, accel_z=0.0)
        self.write_reg(0x1C, 1 << 3)
        self.write_reg(0x6B, 0x80)
        self.assertEqual(i2c_read_seq(self.mpu, 0x1C, 1)[0], 0x00)
        self.write_reg(0x6B, 0x00)
        self.assertEqual(self.read_i16(0x3B), 16384)
        self.assertEqual(i2c_read_seq(self.mpu, 0x75, 1)[0], 0x68)


# ── Runner ────────────────────────────────────────────────────────────────────


def test_mpu6050_rejects_an_unknown_i2c_event():
    with pytest.raises(ValueError, match='mpu6050: unsupported I2C event 0x02'):
        MPU6050Slave().handle_event(0x02)
