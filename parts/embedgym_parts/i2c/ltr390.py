"""LTR390 UV + ambient light sensor."""
from __future__ import annotations

import math

from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_NACK, I2C_READ, I2C_START_RECV, I2C_START_SEND, I2C_WRITE
from embedgym_parts.i2c.js_math import js_round


LTR390_ADDR = 0x53
LTR390_PART_ID = 0xB2
LTR390_MAX_COUNT = 0xFFFFF   # 20-bit data registers

# Integration time per MEAS_RATE resolution code (bits [6:4]), in virtual ns;
# codes 6 and 7 are reserved.
LTR390_RESOLUTION_NS = [400_000_000, 200_000_000, 100_000_000, 50_000_000, 25_000_000, 12_500_000]
LTR390_RESOLUTION_BITS = [20, 19, 18, 17, 16, 13]
# Integration time / 100 ms, the `Int` factor of the datasheet's lux formula.
LTR390_INTEGRATION_FACTOR = [4, 2, 1, 0.5, 0.25, 0.125]
# Analog gain per GAIN code (bits [2:0]); codes 5-7 are reserved.
LTR390_GAIN = [1, 3, 6, 9, 18]
# Measurement repeat period per MEAS_RATE rate code (bits [2:0]), in virtual ns.
LTR390_RATE_NS = [25_000_000, 50_000_000, 100_000_000, 200_000_000,
                  500_000_000, 1_000_000_000, 2_000_000_000, 2_000_000_000]

# Power-on defaults: 18-bit resolution / 100 ms rate, gain 3x.
LTR390_DEFAULT_MEAS_RATE = 0x22
LTR390_DEFAULT_GAIN = 0x01


class LTR390Slave:
    """LTR390 register-map I2C slave (address 0x53), a port of VirtualLTR390 in
    parts/sim/Ltr390.ts — the register semantics its
    spec comment lists, with the clock in virtual ns.

    The AVR part polls its clock every 2 ms and completes the pending
    conversion once `next_due` has passed; here the worker owns a
    virtual-clock timer instead, so the slave reports every new deadline
    through `on_conversion_scheduled(due_ns)` and the worker calls `tick()`
    when that timer fires. `on_interrupt_change(asserted)` mirrors the AVR
    part's INT callback (True = pin driven LOW). The harness-supplied counts
    live in `als` / `uvs` and are latched at conversion time, like the
    element's fields on the AVR. They are the counts at the power-on
    configuration (gain 3, 18-bit / 100 ms); a conversion scales them by
    gain / 3 and integration time / 100 ms, rounds, and saturates at the
    resolution's full scale.
    """

    def __init__(self, now_ns, on_interrupt_change=lambda asserted: None,
                 on_conversion_scheduled=lambda due_ns: None) -> None:
        self.addr = LTR390_ADDR
        self.regs = bytearray(256)
        self.reg_ptr = 0
        self.first_byte = True
        self.als = 45000
        self.uvs = 1200
        self.data_ready = False
        self.next_due_ns = 0
        # Latched threshold event — MAIN_STATUS bit2, and what holds INT low.
        self.interrupt_latched = False
        # Consecutive out-of-range conversions in the source mode.
        self.out_of_range_run = 0
        self.now_ns = now_ns
        self.on_interrupt_change = on_interrupt_change
        self.on_conversion_scheduled = on_conversion_scheduled
        self._apply_power_on_defaults()

    @property
    def interrupt_asserted(self) -> bool:
        return self.interrupt_latched

    def update(self, als: int | None = None, uvs: int | None = None) -> None:
        """`set <role>.als|uvs` — takes effect at the next conversion."""
        if als is not None:
            self.als = als
        if uvs is not None:
            self.uvs = uvs

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
            raise ValueError(f'ltr390: unsupported I2C event 0x{op:02x}')

    # ── Live behaviors on top of the latch ────────────────────────────────────

    def _read_register(self, reg: int) -> int:
        if reg == 0x07:
            status = (0x08 if self.data_ready else 0x00) | (0x04 if self.interrupt_latched else 0x00)
            self.data_ready = False
            self._set_interrupt(False)
            return status
        return self.regs[reg]

    def _write_register(self, reg: int, value: int) -> None:
        if reg == 0x00:
            if value & 0x10:
                self._apply_power_on_defaults()
                return
            before = self.regs[0x00]
            self.regs[0x00] = value
            restarted = (before & 0x0A) != (value & 0x0A)
            if value & 0x02:
                if restarted:
                    self._start_conversion()
            else:
                self.data_ready = False
            return
        if reg == 0x04 and ((value & 0x88) != 0 or ((value >> 4) & 0x07) >= len(LTR390_RESOLUTION_BITS)):
            raise ValueError(f'ltr390: MEAS_RATE 0x{value:02x} sets a reserved resolution code or bit')
        if reg == 0x05 and value >= len(LTR390_GAIN):
            raise ValueError(f'ltr390: GAIN 0x{value:02x} sets a reserved gain code or bit')
        if reg in (0x04, 0x05):
            self.regs[reg] = value
            if self.regs[0x00] & 0x02:
                self._start_conversion()
            return
        if reg == 0x19:
            self.regs[reg] = value
            # Disabling or re-targeting the interrupt abandons any run in
            # progress and releases the pin — the latch belongs to the old
            # configuration.
            self.out_of_range_run = 0
            if not (value & 0x04):
                self._set_interrupt(False)
            return
        if reg == 0x1A or 0x21 <= reg <= 0x26:
            self.regs[reg] = value
            return
        if reg == 0x06 or reg == 0x07 or 0x0D <= reg <= 0x12:
            raise ValueError(f'ltr390: register 0x{reg:02x} is read-only')
        raise ValueError(f'ltr390: write to reserved register 0x{reg:02x}')

    def tick(self, now_ns: int) -> None:
        """Conversion pacing; the worker calls it when the scheduled timer fires."""
        if not (self.regs[0x00] & 0x02) or now_ns < self.next_due_ns:
            return
        self._latch_measurement()
        self.data_ready = True
        self.next_due_ns = now_ns + self._period_ns()
        self.on_conversion_scheduled(self.next_due_ns)

    def _apply_power_on_defaults(self) -> None:
        self.regs[:] = bytes(256)
        self.regs[0x04] = LTR390_DEFAULT_MEAS_RATE
        self.regs[0x05] = LTR390_DEFAULT_GAIN
        self.regs[0x06] = LTR390_PART_ID
        # Thresholds power up wide open: upper at full scale, lower at zero.
        self.regs[0x21] = 0xFF
        self.regs[0x22] = 0xFF
        self.regs[0x23] = 0x0F
        self.data_ready = False
        self.next_due_ns = 0
        self.out_of_range_run = 0
        self._set_interrupt(False)

    def _set_interrupt(self, asserted: bool) -> None:
        if self.interrupt_latched == asserted:
            return
        self.interrupt_latched = asserted
        self.on_interrupt_change(asserted)

    def _threshold(self, base: int) -> int:
        """20-bit LSB-first threshold at the given base register."""
        r = self.regs
        return r[base] | (r[base + 1] << 8) | ((r[base + 2] & 0x0F) << 16)

    def _evaluate_interrupt(self, count: int, uv_mode: bool) -> None:
        """Threshold check for a just-completed conversion. Only conversions in
        the configured source mode count; the persistence field requires that
        many consecutive out-of-range readings beyond the first before firing."""
        cfg = self.regs[0x19]
        if not (cfg & 0x04):
            self.out_of_range_run = 0
            return
        source_is_uv = ((cfg >> 4) & 0x03) == 3
        if source_is_uv != uv_mode:
            return

        out_of_range = count > self._threshold(0x21) or count < self._threshold(0x24)
        if not out_of_range:
            self.out_of_range_run = 0
            return
        self.out_of_range_run += 1
        if self.out_of_range_run > ((self.regs[0x1A] >> 4) & 0x0F):
            self._set_interrupt(True)

    def _start_conversion(self) -> None:
        self.data_ready = False
        self.next_due_ns = self.now_ns() + self._period_ns()
        self.on_conversion_scheduled(self.next_due_ns)

    def _period_ns(self) -> int:
        """A conversion cannot finish faster than its integration time, and
        repeats no faster than the programmed rate."""
        meas_rate = self.regs[0x04]
        return max(LTR390_RESOLUTION_NS[(meas_rate >> 4) & 0x07], LTR390_RATE_NS[meas_rate & 0x07])

    def _latch_measurement(self) -> None:
        uv_mode = (self.regs[0x00] & 0x08) != 0
        raw = self.uvs if uv_mode else self.als
        label = 'uvs' if uv_mode else 'als'
        if not isinstance(raw, (int, float)) or not math.isfinite(raw) or raw < 0 or raw > LTR390_MAX_COUNT:
            raise ValueError(f'ltr390: {label} must be a number in 0..{LTR390_MAX_COUNT}, got {raw}')
        res = (self.regs[0x04] >> 4) & 0x07
        scaled = raw * LTR390_GAIN[self.regs[0x05]] * LTR390_INTEGRATION_FACTOR[res] / 3
        count = min(js_round(scaled), (1 << LTR390_RESOLUTION_BITS[res]) - 1)
        base = 0x10 if uv_mode else 0x0D
        self.regs[base] = count & 0xFF
        self.regs[base + 1] = (count >> 8) & 0xFF
        self.regs[base + 2] = (count >> 16) & 0x0F
        self._evaluate_interrupt(count, uv_mode)
