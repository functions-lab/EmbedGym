"""VL53L0X time-of-flight ranging sensor."""
from __future__ import annotations

import math

from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_NACK, I2C_READ, I2C_START_RECV, I2C_START_SEND, I2C_WRITE
from embedgym_parts.i2c.js_math import js_round


VL53L0X_ADDR = 0x29
VL53L0X_MAX_RANGE_MM = 2000
VL53L0X_OUT_OF_RANGE_MM = 8190
# Preloaded at 0xF8–0xF9; drivers multiply the inter-measurement period (ms) by
# this before storing it as the dword at 0x04.
VL53L0X_OSC_CALIBRATE_VAL = 0x0BCC
# Back-to-back continuous cadence ≈ the default 33 ms timing budget.
VL53L0X_BACK_TO_BACK_PERIOD_NS = 30 * 1_000_000
# Shortest timed period the AVR part paces (its tick granularity).
VL53L0X_MIN_TIMED_PERIOD_NS = 5 * 1_000_000
# NVM dwords served through the 0x94-index / 0x90–0x93 window.
VL53L0X_NVM = {
    0x6B: 0x00008800,  # reference SPAD: aperture type, count 8
    0x24: 0xFFFFFFFF,  # good SPAD map bytes 0–3
    0x25: 0xFFFF0000,  # good SPAD map bytes 4–5
}


class VL53L0XSlave:
    """VL53L0X register-map I2C slave (address 0x29), a port of VirtualVL53L0X in
    parts/sim/Vl53l0x.ts — a 256-byte auto-increment
    latch plus the live behaviors its spec comment lists (SYSRANGE_START
    trigger and start-bit-clear, page-1 wrapper writes, the 0x13/0x0B interrupt
    pair, the 0x83 strobe, the NVM window, the constant peak signal rate, the
    result block and the movable address at 0x8A), with the clock in virtual ns.

    Single-shot and ref-calibration triggers complete synchronously. The AVR
    part paces continuous modes from a 5 ms tick; here the slave reports each
    measurement deadline through `on_measurement_scheduled(due_ns)` and the
    worker calls `tick()` when that timer fires. A write to 0x8A calls
    `on_address_change(old, new)` before the address commits, so the worker can
    re-key the bus (and refuse a collision by raising).
    """

    def __init__(self, now_ns, on_address_change=lambda old, new: None,
                 on_measurement_scheduled=lambda due_ns: None) -> None:
        self.addr = VL53L0X_ADDR
        self.regs = bytearray(256)
        self.reg_ptr = 0
        self.first_byte = True
        self.distance_mm = 100.0
        self.mode = 'idle'   # 'idle' | 'backToBack' | 'timed'
        self.interrupt_asserted = False
        self.next_due_ns = 0
        self.now_ns = now_ns
        self.on_address_change = on_address_change
        self.on_measurement_scheduled = on_measurement_scheduled
        r = self.regs
        r[0x8A] = VL53L0X_ADDR
        r[0x91] = 0x3C   # stop variable (read at init, written back verbatim)
        r[0xC0] = 0xEE   # model ID
        r[0xC1] = 0xAA
        r[0xC2] = 0x10   # revision ID (minor rev 1 in the high nibble)
        r[0x89] = 0x01
        # Good-SPAD window bits 12–19: 8 aperture SPADs, matching the NVM config.
        r[0xB0:0xB6] = bytes([0x00, 0xF0, 0x0F, 0x00, 0x00, 0x00])
        r[0xF8] = (VL53L0X_OSC_CALIBRATE_VAL >> 8) & 0xFF
        r[0xF9] = VL53L0X_OSC_CALIBRATE_VAL & 0xFF
        self._latch_measurement()

    def update(self, distance: float) -> None:
        """`set <role>.distance` — read at the next measurement."""
        self.distance_mm = distance

    # ── I2C transport ─────────────────────────────────────────────────────────

    def handle_event(self, event: int) -> int:
        op   = event & 0xFF
        data = (event >> 8) & 0xFF

        if op in (I2C_START_RECV, I2C_START_SEND):
            # reg_ptr survives: a repeated START reaches us as FINISH + START.
            self.first_byte = True
            return 0
        elif op == I2C_WRITE:
            if self.first_byte:
                self.reg_ptr = data
                self.first_byte = False
            else:
                reg = self.reg_ptr
                self.reg_ptr = (reg + 1) & 0xFF
                self._write_register(reg, data)
            return 0
        elif op == I2C_READ:
            reg = self.reg_ptr
            self.reg_ptr = (reg + 1) & 0xFF
            return self._read_register(reg)
        elif op in (I2C_FINISH, I2C_NACK):
            self.first_byte = True
            return 0
        else:
            raise ValueError(f'vl53l0x: unsupported I2C event 0x{op:02x}')

    # ── Live behaviors on top of the latch ────────────────────────────────────

    def _read_register(self, reg: int) -> int:
        page = self.regs[0xFF]
        if reg == 0x00 and page == 0x00:
            return self.regs[0x00] & 0xFE
        if reg == 0x04 and page != 0x00:
            return 0x00
        if reg == 0x13:
            return 0x04 if self.interrupt_asserted else 0x00
        if reg == 0x83:
            return self.regs[0x83] | 0x01
        if reg == 0xB6:
            return 0x0C   # peak signal rate ref 24.0 MCPS, 9.7 fixed point
        if reg == 0xB7:
            return 0x00
        if 0x90 <= reg <= 0x93 and self.regs[0x81] == 0x01:
            dword = VL53L0X_NVM.get(self.regs[0x94], 0)
            return (dword >> (8 * (0x93 - reg))) & 0xFF
        return self.regs[reg]

    def _write_register(self, reg: int, value: int) -> None:
        if reg == 0x00:
            if self.regs[0xFF] != 0x00:
                return
            self.regs[0x00] = value
            if value & 0x01:
                # Single-shot measurement or VHV/phase ref-calibration trigger
                # (0x01 / 0x41). Completes synchronously; the drivers poll 0x13 next.
                self.mode = 'idle'
                self._latch_measurement()
                self.interrupt_asserted = True
            elif value == 0x02:
                self.mode = 'backToBack'
                self._schedule(self.now_ns() + VL53L0X_BACK_TO_BACK_PERIOD_NS)
            elif value == 0x04:
                # The first measurement starts at once and takes one budget; the
                # inter-measurement period applies between measurements.
                self.mode = 'timed'
                self._schedule(self.now_ns() + VL53L0X_BACK_TO_BACK_PERIOD_NS)
            elif value == 0x00:
                self.mode = 'idle'
            else:
                raise ValueError(f'vl53l0x: unsupported SYSRANGE_START value 0x{value:02x}')
            return
        if reg == 0x0B:
            if value & 0x01:
                self.interrupt_asserted = False
            return
        if reg == 0x8A:
            new_addr = value & 0x7F
            if new_addr != self.addr:
                self.on_address_change(self.addr, new_addr)
                self.addr = new_addr
            self.regs[0x8A] = new_addr
            return
        self.regs[reg] = value

    def tick(self, now_ns: int) -> None:
        """Continuous-mode pacing; the worker calls it when the scheduled timer fires."""
        if self.mode == 'idle' or now_ns < self.next_due_ns:
            return
        self._latch_measurement()
        self.interrupt_asserted = True
        period = self._timed_period_ns() if self.mode == 'timed' else VL53L0X_BACK_TO_BACK_PERIOD_NS
        self._schedule(now_ns + period)

    def _schedule(self, due_ns: int) -> None:
        self.next_due_ns = due_ns
        self.on_measurement_scheduled(due_ns)

    def _timed_period_ns(self) -> int:
        """Inter-measurement period: big-endian dword at 0x04 = ms × OSC_CALIBRATE_VAL."""
        r = self.regs
        dword = (r[0x04] << 24) | (r[0x05] << 16) | (r[0x06] << 8) | r[0x07]
        return max(js_round(dword / VL53L0X_OSC_CALIBRATE_VAL) * 1_000_000, VL53L0X_MIN_TIMED_PERIOD_NS)

    def _latch_measurement(self) -> None:
        raw = self.distance_mm
        if not isinstance(raw, (int, float)) or not math.isfinite(raw) or raw < 0:
            raise ValueError(f'vl53l0x: distance must be a finite non-negative number, got {raw}')
        in_range = raw <= VL53L0X_MAX_RANGE_MM
        mm = js_round(raw) if in_range else VL53L0X_OUT_OF_RANGE_MM
        r = self.regs
        # Device range status in bits 6:3 of 0x14 (+ bit0 data-ready): internal
        # 11 → API status 0 (valid); internal 9 → API status 4 (phase fail, how
        # the Adafruit driver reports out of range).
        r[0x14] = 0x59 if in_range else 0x49
        r[0x15] = 0x00
        r[0x16] = 0x05   # effective SPAD count 5.0 (8.8 fixed point)
        r[0x17] = 0x00
        r[0x18] = 0x00
        r[0x19] = 0x00
        # Signal rate 0.75 MCPS and ambient 0.03 MCPS (9.7) — values the ST API's
        # 16-bit AVR arithmetic and its sigma / signal-rate limit checks accept.
        r[0x1A] = 0x00
        r[0x1B] = 0x60
        r[0x1C] = 0x00
        r[0x1D] = 0x04
        r[0x1E] = (mm >> 8) & 0xFF
        r[0x1F] = mm & 0xFF
