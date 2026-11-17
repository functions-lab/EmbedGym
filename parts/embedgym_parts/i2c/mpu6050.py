"""MPU-6050 IMU."""
from __future__ import annotations

import math

from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_NACK, I2C_READ, I2C_START_RECV, I2C_START_SEND, I2C_WRITE


PWR_MGMT_1 = 0x6B
PWR_MGMT_2 = 0x6C
DEVICE_RESET = 0x80
SLEEP = 0x40
CYCLE = 0x20
TEMP_DIS = 0x08
CLKSEL_STOP = 7


class MPU6050Slave:
    """MPU-6050 register-map I2C slave (address 0x68 or 0x69).

    A port of VirtualMPU6050 in frontend/src/simulation/parts/ProtocolParts.ts:
    the physical state is held in engineering units and the output registers
    are recomputed from it on every drive and on every ACCEL_CONFIG /
    GYRO_CONFIG / PWR_MGMT write, saturating at the selected full scale.

    Power-on and DEVICE_RESET load the datasheet reset values: every register
    0x00 except PWR_MGMT_1 = 0x40 (SLEEP) and WHO_AM_I = 0x68. A sensor that is
    not running (SLEEP, CLKSEL = 7, TEMP_DIS for the temperature, a PWR_MGMT_2
    STBY bit for an axis) holds its data registers at their last value, so
    they read 0 until the firmware clears SLEEP. Waking refreshes them at
    once; the 30 ms gyro start-up is not modeled. Cycle mode and the external
    and reserved clock sources raise.
    """

    def __init__(self, addr: int = 0x68):
        self.addr       = addr
        self.regs       = bytearray(256)
        self.reg_ptr    = 0
        self.first_byte = True
        self.accel      = {'x': 0.0, 'y': 0.0, 'z': 1.0}   # g
        self.gyro       = {'x': 0.0, 'y': 0.0, 'z': 0.0}   # deg/s
        self.temp_c     = 25.0
        self._reset_registers()

    def _reset_registers(self) -> None:
        self.regs[:] = bytes(256)
        self.regs[0x75] = 0x68   # WHO_AM_I
        self.regs[PWR_MGMT_1] = SLEEP

    def _write_i16(self, reg_h: int, raw_float: float) -> None:
        # floor(x + 0.5) is JS Math.round; Python's round() is half-to-even.
        raw = max(-32768, min(32767, math.floor(raw_float + 0.5))) & 0xFFFF
        self.regs[reg_h]     = (raw >> 8) & 0xFF
        self.regs[reg_h + 1] =  raw        & 0xFF

    def _refresh_outputs(self) -> None:
        pwr1 = self.regs[PWR_MGMT_1]
        if pwr1 & SLEEP or pwr1 & 0x07 == CLKSEL_STOP:
            return
        standby = self.regs[PWR_MGMT_2]
        # AFS_SEL (ACCEL_CONFIG bits 4:3): 16384/8192/4096/2048 LSB per g.
        # FS_SEL (GYRO_CONFIG bits 4:3): 131/65.5/32.75/16.375 LSB per deg/s.
        accel_lsb_per_g  = 16384 >> ((self.regs[0x1C] >> 3) & 3)
        gyro_lsb_per_dps = 131 / (1 << ((self.regs[0x1B] >> 3) & 3))
        # PWR_MGMT_2 STBY_XA..STBY_ZG are bits 5..0.
        for i, axis in enumerate('xyz'):
            if not standby & (0x20 >> i):
                self._write_i16(0x3B + 2 * i, self.accel[axis] * accel_lsb_per_g)
            if not standby & (0x04 >> i):
                self._write_i16(0x43 + 2 * i, self.gyro[axis] * gyro_lsb_per_dps)
        if not pwr1 & TEMP_DIS:
            # TEMP: T(°C) = TEMP_OUT / 340 + 36.53
            self._write_i16(0x41, (self.temp_c - 36.53) * 340)

    def _write_pwr_mgmt_1(self, value: int) -> None:
        # DEVICE_RESET is self-clearing on real silicon; a driver that polls it
        # for completion (Adafruit_MPU6050::reset) spins forever otherwise.
        if value & DEVICE_RESET:
            self._reset_registers()
            return
        if value & (SLEEP | CYCLE) == CYCLE:
            raise ValueError('mpu6050: cycle mode (PWR_MGMT_1 CYCLE set, SLEEP clear) is not modeled')
        if value & 0x07 in (4, 5):
            raise ValueError(f'mpu6050: CLKSEL {value & 0x07} needs an external clock on CLKIN, which is not modeled')
        if value & 0x07 == 6:
            raise ValueError('mpu6050: CLKSEL 6 is reserved')
        self.regs[PWR_MGMT_1] = value
        self._refresh_outputs()

    def handle_event(self, event: int) -> int:
        op   = event & 0xFF          # low byte = operation type
        data = (event >> 8) & 0xFF   # high byte = data byte (for WRITE)

        if op in (I2C_START_RECV, I2C_START_SEND):
            # reg_ptr is NOT reset here — a write-then-read (repeated START)
            # relies on reg_ptr having been set by the preceding WRITE phase.
            self.first_byte = True
            return 0   # ACK (0 = success in QEMU convention)

        elif op == I2C_WRITE:
            if self.first_byte:
                self.reg_ptr    = data
                self.first_byte = False
            else:
                reg = self.reg_ptr
                self.reg_ptr = (reg + 1) & 0xFF
                if reg == PWR_MGMT_1:
                    self._write_pwr_mgmt_1(data)
                elif reg == 0x68:
                    # SIGNAL_PATH_RESET self-clears, like DEVICE_RESET.
                    self.regs[0x68] = 0
                else:
                    self.regs[reg] = data
                    if reg in (0x1B, 0x1C, PWR_MGMT_2):
                        self._refresh_outputs()
            return 0   # ACK

        elif op == I2C_READ:
            val = self.regs[self.reg_ptr]
            self.reg_ptr = (self.reg_ptr + 1) & 0xFF
            return val

        elif op in (I2C_FINISH, I2C_NACK):
            self.first_byte = True
            return 0
        else:
            raise ValueError(f'mpu6050: unsupported I2C event 0x{op:02x}')

    def update(self, accel_x: float = 0, accel_y: float = 0, accel_z: float = 1,
               gyro_x: float = 0, gyro_y: float = 0, gyro_z: float = 0,
               temp: float = 25.0) -> None:
        self.accel  = {'x': accel_x, 'y': accel_y, 'z': accel_z}
        self.gyro   = {'x': gyro_x,  'y': gyro_y,  'z': gyro_z}
        self.temp_c = temp
        self._refresh_outputs()
