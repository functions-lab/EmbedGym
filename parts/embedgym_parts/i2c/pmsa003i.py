"""PMSA003I particulate-matter sensor."""
from __future__ import annotations

import math

from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_NACK, I2C_READ, I2C_START_RECV, I2C_START_SEND, I2C_WRITE
from embedgym_parts.i2c.js_math import js_round


PMSA003I_ADDR = 0x12
PMSA003I_FRAME_SIZE = 32
PMSA003I_MAX_UGM3 = 1000


def atmospheric(standard: int) -> int:
    """Atmospheric-environment concentration for a standard (CF=1) one: equal up
    to 30 µg/m³, 2/3 of it from 80 µg/m³, linear in between (the cf_1 / cf_atm
    relation reported for Plantower sensors by Barkjohn et al., Sensors 2022,
    22, 9669)."""
    if standard <= 30:
        return standard
    if standard < 80:
        return js_round(30 + (standard - 30) * 7 / 15)
    return js_round(standard * 2 / 3)


class PMSA003ISlave:
    """PMSA003I frame-streaming I2C slave (address 0x12), a port of
    VirtualPMSA003I in parts/sim/Pmsa003i.ts.

    The part has no registers and no commands: every read transaction clocks
    out the 32-byte Plantower frame from byte 0 — 0x42 0x4D, length 28, PM1.0 /
    PM2.5 / PM10 standard then atmospheric (µg/m³, u16 BE), six particle
    counts, version + error, u16 checksum over bytes 0–29 — wrapping after 32
    bytes; the pointer resets at STOP. A transaction reads the frame as it
    stood at its first byte, so an update never lands mid-frame. The standard
    (CF=1) fields carry the driven values, the atmospheric fields derive from
    them through `atmospheric()`, the particle counts are the AVR part's
    synthetic derivation, and the frame is always ready (the AVR part models
    no refresh cadence either). A written byte is ACKed and changes nothing,
    as on the AVR part.
    """

    def __init__(self) -> None:
        self.addr = PMSA003I_ADDR
        self.pm1_0 = 8.0
        self.pm2_5 = 12.0
        self.pm10 = 20.0
        self.frame: list[int] = []
        self._transfer: list[int] | None = None
        self.ptr = 0
        self._rebuild()

    def update(self, pm1_0=None, pm2_5=None, pm10=None) -> None:
        """`set <role>.pm1_0 / pm2_5 / pm10` (µg/m³); an absent key keeps its value."""
        changes = {k: v for k, v in (('pm1_0', pm1_0), ('pm2_5', pm2_5), ('pm10', pm10)) if v is not None}
        for key, value in changes.items():
            if (not isinstance(value, (int, float)) or isinstance(value, bool)
                    or not math.isfinite(value) or value < 0 or value > PMSA003I_MAX_UGM3):
                raise ValueError(f'pmsa003i: {key} must be a number in 0–{PMSA003I_MAX_UGM3} µg/m³, got {value}')
        for key, value in changes.items():
            setattr(self, key, value)
        self._rebuild()

    def _rebuild(self) -> None:
        pm1 = js_round(self.pm1_0)
        pm25 = js_round(self.pm2_5)
        pm100 = js_round(self.pm10)
        values = [
            28,                         # frame length: 2×13 data bytes + 2 checksum bytes
            pm1, pm25, pm100,           # standard concentrations
            atmospheric(pm1), atmospheric(pm25), atmospheric(pm100),
            # Synthetic particle counts per 0.1 L, monotonic in the concentrations.
            pm1 * 30,
            pm1 * 9,
            pm25 * 2,
            js_round(pm100 * 0.5),
            js_round(pm100 * 0.2),
            js_round(pm100 * 0.1),
            0,                          # version + error code
        ]
        frame = [0x42, 0x4D]
        for v in values:
            frame += [(v >> 8) & 0xFF, v & 0xFF]
        checksum = sum(frame)
        frame += [(checksum >> 8) & 0xFF, checksum & 0xFF]
        self.frame = frame

    def handle_event(self, event: int) -> int:
        op   = event & 0xFF
        data = (event >> 8) & 0xFF

        if op in (I2C_START_RECV, I2C_START_SEND):
            self._transfer = None
            self.ptr = 0
            return 0
        elif op == I2C_WRITE:
            return 0
        elif op == I2C_READ:
            if self._transfer is None:
                self._transfer = self.frame
            value = self._transfer[self.ptr]
            self.ptr = (self.ptr + 1) % PMSA003I_FRAME_SIZE
            return value
        elif op in (I2C_FINISH, I2C_NACK):
            self._transfer = None
            self.ptr = 0
            return 0
        else:
            raise ValueError(f'pmsa003i: unsupported I2C event 0x{op:02x}')
