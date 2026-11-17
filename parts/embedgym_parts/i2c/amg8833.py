"""AMG8833 8x8 thermal array."""
from __future__ import annotations

import math

from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_NACK, I2C_READ, I2C_START_RECV, I2C_START_SEND, I2C_WRITE
from embedgym_parts.i2c.js_math import js_round


AMG8833_ADDRESSES = (0x68, 0x69)
AMG8833_PIXELS = 64
AMG8833_INPUTS = ('thermistorTemperature', 'pixelAdcOverflow', *(f'pixel{i}' for i in range(AMG8833_PIXELS)))
MS_NS = 1_000_000
NORMAL = 0x00
SLEEP = 0x10
POWER_MODES = (NORMAL, SLEEP, 0x20, 0x21)
STANDBY_PERIOD_NS = {0x20: 60_000 * MS_NS, 0x21: 10_000 * MS_NS}
FLAG_RESET = 0x30
INITIAL_RESET = 0x3F
WAKE_TO_INITIAL_RESET_NS = 50 * MS_NS
INITIAL_TO_FLAG_RESET_NS = 2 * MS_NS
MOVING_AVERAGE_SEQUENCE = (0x50, 0x45, 0x57)
PIXEL_RANGE = (-512, 511.75)
THERMISTOR_RANGE = (-20, 80)


def check_inputs(values: dict) -> None:
    """The element's input contract (applyThermalInputs in Amg8833.ts)."""
    for key, value in values.items():
        if key == 'pixelAdcOverflow':
            if not isinstance(value, bool):
                raise ValueError('amg8833: pixelAdcOverflow must be boolean')
        elif key in AMG8833_INPUTS:
            low, high = THERMISTOR_RANGE if key == 'thermistorTemperature' else PIXEL_RANGE
            if (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)
                    or not low <= value <= high):
                raise ValueError(f'amg8833: {key} must be finite and within {low}..{high} C')
        else:
            raise ValueError(f'amg8833: unknown input "{key}"')


class AMG8833Slave:
    """AMG8833 register-map I2C slave (address 0x68 or 0x69), a port of
    VirtualAMG8833 in parts/sim/Amg8833.ts, with the
    clock in virtual ns.

    The AVR part chains one CPU-clock event per frame; here the slave keeps the
    next frame's deadline, reports it through `on_conversion_scheduled(due_ns)`,
    and the worker calls `tick(now_ns)` when that timer fires. A timer left
    armed across sleep or a restart finds no frame due and does nothing.
    `on_interrupt_change(asserted)` drives INT (True = pin LOW). The worker
    calls `power_on()` once both hooks are in place; frames run from there.
    """

    def __init__(self, addr: int, now_ns, on_interrupt_change=lambda asserted: None,
                 on_conversion_scheduled=lambda due_ns: None) -> None:
        if addr not in AMG8833_ADDRESSES:
            raise ValueError(f'amg8833: address must be 0x68 or 0x69, got {addr:#x}')
        self.addr = addr
        self.regs = bytearray(256)
        self.reg_ptr = 0
        self.first_byte = True
        self.snapshot: bytes | None = None
        self.previous: list[int] | None = None
        self.comparator = [0] * AMG8833_PIXELS
        self.frames = 0
        self.sequence = 0
        self.woke_at_ns: int | None = None
        self.initial_reset_at_ns: int | None = None
        self.next_frame_ns: int | None = None
        self.interrupt_asserted = False
        self.inputs: dict = {'thermistorTemperature': 25, 'pixelAdcOverflow': False,
                             **{f'pixel{i}': 25 for i in range(AMG8833_PIXELS)}}
        self.now_ns = now_ns
        self.on_interrupt_change = on_interrupt_change
        self.on_conversion_scheduled = on_conversion_scheduled

    def power_on(self) -> None:
        self._restart_frames(self.now_ns())

    def update(self, values: dict) -> None:
        """`set <role>.pixel<n>|thermistorTemperature|pixelAdcOverflow`, read by the next frame."""
        check_inputs(values)
        self.inputs.update(values)

    # ── I2C transport ─────────────────────────────────────────────────────────

    def handle_event(self, event: int) -> int:
        op   = event & 0xFF
        data = (event >> 8) & 0xFF

        if op in (I2C_START_RECV, I2C_START_SEND, I2C_FINISH, I2C_NACK):
            # The pointer survives STOP and repeated START; a read transaction
            # sees the registers as they were at its first byte.
            self.first_byte = True
            self.snapshot = None
            return 0
        elif op == I2C_WRITE:
            if self.first_byte:
                self.reg_ptr = data
                self.first_byte = False
            else:
                self._write_register(self.reg_ptr, data)
                self.reg_ptr = (self.reg_ptr + 1) & 0xFF
            return 0
        elif op == I2C_READ:
            return self._read_byte()
        else:
            raise ValueError(f'amg8833: unsupported I2C event 0x{op:02x}')

    def _read_byte(self) -> int:
        if self.regs[0] == SLEEP:
            raise ValueError('amg8833: reads are invalid in sleep mode')
        reg = self.reg_ptr
        if not (reg == 0 or 2 <= reg <= 4 or 7 <= reg <= 0x17 or reg >= 0x80):
            raise ValueError(f'amg8833: register 0x{reg:x} is not readable')
        if self.snapshot is None:
            self.snapshot = bytes(self.regs)
        self.reg_ptr = (reg + 1) & 0xFF
        return self.snapshot[reg]

    def _write_register(self, reg: int, value: int) -> None:
        now = self.now_ns()
        if self.regs[0] == SLEEP and not (reg == 0 and value == NORMAL):
            return
        if reg == 0:
            if value not in POWER_MODES:
                raise ValueError(f'amg8833: reserved power mode 0x{value:x}')
            if self.regs[0] == value:
                return
            if self.regs[0] == SLEEP:
                self.woke_at_ns = now
                self.initial_reset_at_ns = None
            self.regs[0] = value
            self.previous = None
            self._restart_frames(now)
            self._update_interrupt()
        elif reg == 1:
            if value == FLAG_RESET:
                if self.woke_at_ns is not None and (
                        self.initial_reset_at_ns is None
                        or now - self.initial_reset_at_ns < INITIAL_TO_FLAG_RESET_NS):
                    raise ValueError('amg8833: wake requires initial reset and a 2 ms wait before flag reset')
                self._clear_flags(6)
                self.woke_at_ns = None
            elif value == INITIAL_RESET:
                if self.woke_at_ns is not None and now - self.woke_at_ns < WAKE_TO_INITIAL_RESET_NS:
                    raise ValueError('amg8833: wake requires 50 ms before initial reset')
                self._clear_flags(6)
                self.regs[0x80:] = bytes(0x80)
                self.previous = None
                self.comparator = [0] * AMG8833_PIXELS
                self.frames = 0
                self.initial_reset_at_ns = now
                self._restart_frames(now)
            else:
                raise ValueError(f'amg8833: reserved reset command 0x{value:x}')
        elif reg == 2:
            self.regs[reg] = value & 1
            self._restart_frames(now)
        elif reg == 3:
            if (value & 2) != (self.regs[reg] & 2):
                self.comparator = [0] * AMG8833_PIXELS
            self.regs[reg] = value & 3
            self._update_interrupt()
        elif reg == 5:
            self._clear_flags(value & 6)
        elif reg == 7:
            self.regs[reg] = value & 0x20
        elif 8 <= reg <= 0x0D:
            self.regs[reg] = value & 0x0F if reg & 1 else value
        elif reg == 0x1F:
            if value == 0:
                self.sequence = 0
            elif self.sequence < len(MOVING_AVERAGE_SEQUENCE) and value == MOVING_AVERAGE_SEQUENCE[self.sequence]:
                self.sequence += 1
            else:
                raise ValueError('amg8833: invalid moving-average command sequence')
        else:
            raise ValueError(f'amg8833: write to read-only or reserved register 0x{reg:x}')

    def _clear_flags(self, mask: int) -> None:
        self.regs[4] &= ~mask & 0xFF
        if mask & 2:
            self.regs[0x10:0x18] = bytes(8)
        self._update_interrupt()

    def _update_interrupt(self) -> None:
        asserted = self.regs[0] != SLEEP and bool(self.regs[3] & 1) and bool(self.regs[4] & 2)
        if asserted != self.interrupt_asserted:
            self.interrupt_asserted = asserted
            self.on_interrupt_change(asserted)

    # ── Frame clock ───────────────────────────────────────────────────────────

    def _period_ns(self) -> int:
        mode = self.regs[0]
        if mode == NORMAL:
            return (1000 if self.regs[2] & 1 else 100) * MS_NS
        if mode in STANDBY_PERIOD_NS:
            return STANDBY_PERIOD_NS[mode]
        raise ValueError(f'amg8833: no conversion period for mode 0x{mode:x}')

    def _restart_frames(self, now_ns: int) -> None:
        if self.regs[0] == SLEEP:
            self.next_frame_ns = None
            return
        self.next_frame_ns = now_ns + self._period_ns()
        self.on_conversion_scheduled(self.next_frame_ns)

    def tick(self, now_ns: int) -> None:
        """Complete every frame due by `now_ns`, each at its own deadline."""
        ran = False
        while self.next_frame_ns is not None and self.next_frame_ns <= now_ns:
            self._complete_frame()
            self.next_frame_ns += self._period_ns()
            ran = True
        if ran:
            self.on_conversion_scheduled(self.next_frame_ns)

    def _put_temperature(self, reg: int, count: int) -> None:
        self.regs[reg] = count & 0xFF
        self.regs[reg + 1] = (count >> 8) & 0x0F

    def _threshold(self, reg: int) -> int:
        count = self.regs[reg] | (self.regs[reg + 1] << 8)
        return count - 0x1000 if count & 0x800 else count

    def _complete_frame(self) -> None:
        r = self.regs
        raw = [js_round(self.inputs[f'pixel{i}'] * 4) for i in range(AMG8833_PIXELS)]
        previous = self.previous
        thermistor = self.inputs['thermistorTemperature']
        self._put_temperature(0x0E, js_round(abs(thermistor) * 16) | (0x800 if thermistor < 0 else 0))
        if self.inputs['pixelAdcOverflow']:
            r[4] |= 4
        self.frames += 1
        absolute = bool(r[3] & 2)
        for i in range(AMG8833_PIXELS):
            averaged = bool(r[7] & 0x20) and previous is not None
            count = js_round((raw[i] + previous[i]) / 2) if averaged else raw[i]
            self._put_temperature(0x80 + 2 * i, count)
            if self.frames < 2 or (not absolute and previous is None):
                continue
            measured = count if absolute else raw[i] - previous[i]
            active = self.comparator[i]
            hysteresis = self._threshold(0x0C)
            if (active == 1 and measured <= hysteresis) or (active == -1 and measured >= hysteresis):
                active = 0
            if active == 0:
                if measured > self._threshold(0x08):
                    active = 1
                elif measured < self._threshold(0x0A):
                    active = -1
            self.comparator[i] = active
            if active != 0:
                r[0x10 + (i >> 3)] |= 1 << (i & 7)
                r[4] |= 2
        self.previous = raw
        self._update_interrupt()
