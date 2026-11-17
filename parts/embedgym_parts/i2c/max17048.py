"""MAX17048 lithium fuel gauge."""
from __future__ import annotations

import heapq
import itertools
import math

from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_NACK, I2C_READ, I2C_START_RECV, I2C_START_SEND, I2C_WRITE
from embedgym_parts.i2c.js_math import js_round


MAX17048_ADDR = 0x36
MAX17048_INPUTS = ('batteryConnected', 'cellVoltage', 'openCircuitVoltage', 'stateOfCharge', 'chargeRate')
MAX17048_RANGES = {
    'cellVoltage': (0, 4.5), 'openCircuitVoltage': (0, 4.5),
    'stateOfCharge': (0, 100), 'chargeRate': (-6815.744, 6815.536),
}
MS_NS = 1_000_000
HOUR_MS = 3_600_000


class MAX17048Slave:
    """MAX17048 register-map I2C slave (address 0x36), a port of VirtualMAX17048
    in parts/sim/Max17048.ts, with the clock in
    virtual ns.

    The AVR part schedules each acquisition step on the CPU clock; here the
    steps sit on one queue, the slave reports its earliest deadline through
    `on_conversion_scheduled(due_ns)`, and the worker calls `tick(now_ns)` when
    that timer fires. Each step runs at its own deadline. A step left queued
    across a restart finds its generation stale and does nothing.
    `on_interrupt_change(asserted)` drives ALRT/INT (True = pin LOW). The cell
    starts disconnected: the chip powers up on the `update()` that connects a
    cell of at least 2.5 V, and NACKs while unpowered. The worker reports the
    firmware's QStart level through `set_quick_start_pin` and the SDA/SCL
    levels through `set_bus_pins`.
    """

    def __init__(self, now_ns, on_interrupt_change=lambda asserted: None,
                 on_conversion_scheduled=lambda due_ns: None) -> None:
        self.addr = MAX17048_ADDR
        self.regs = bytearray(256)
        self.pointer = 0
        self.first_byte = True
        self.pending_high: int | None = None
        self.snapshot: bytes | None = None
        self.cell: dict = {'batteryConnected': False, 'cellVoltage': 3.8, 'openCircuitVoltage': 3.8,
                           'stateOfCharge': 50, 'chargeRate': 0}
        self.now_ns = now_ns
        self.on_interrupt_change = on_interrupt_change
        self.on_conversion_scheduled = on_conversion_scheduled
        self.cell_origin_ns = now_ns()
        self.powered = False
        self.sleeping = False
        self.bus_sleeping = False
        self.hibernating = False
        self.seeded = False
        self.adc_ready = False
        self.generation = 0
        self.low_rate_since_ns: int | None = None
        self.previous_soc = 100.0
        self.change_soc = 0.0
        self.below_reset = False
        self.reset_generation = 0
        self.bus_generation = 0
        self.quick_pin_high = False
        self.bus_sda_high = True
        self.bus_scl_high = True
        self.interrupt_asserted = False
        self._events: list = []
        self._seq = itertools.count()
        self._at: int | None = None

    def update(self, values: dict, at_ns: int) -> None:
        """`set <role>.<input>` at virtual `at_ns`; SOC keeps integrating the
        previous charge rate up to that instant."""
        for key in values:
            if key not in MAX17048_INPUTS:
                raise ValueError(f'max17048: unknown property "{key}"')
        self._at = at_ns
        try:
            updated = {**self.cell, 'stateOfCharge': self._current_soc(), **values}
            check_cell(updated)
            self.cell = updated
            self.cell_origin_ns = at_ns
            self._sync_power()
            self._check_reset_comparator()
        finally:
            self._at = None
        self._arm(at_ns)

    def _clock(self) -> int:
        return self.now_ns() if self._at is None else self._at

    def _current_soc(self) -> float:
        elapsed_ms = (self._clock() - self.cell_origin_ns) / MS_NS
        return max(0.0, min(100.0, self.cell['stateOfCharge'] + self.cell['chargeRate'] * elapsed_ms / HOUR_MS))

    # ── Pins ──────────────────────────────────────────────────────────────────

    def set_quick_start_pin(self, high: bool, initial: bool = False) -> None:
        if not initial and high and not self.quick_pin_high:
            self.quick_start()
        self.quick_pin_high = high
        self._arm(self._clock())

    def set_bus_pins(self, sda_high: bool, scl_high: bool) -> None:
        self.bus_sda_high = sda_high
        self.bus_scl_high = scl_high
        if self.bus_sleeping and (sda_high or scl_high):
            self.bus_sleeping = False
            self._sync_sleep()
        self._check_bus_sleep()
        self._arm(self._clock())

    def _drive_interrupt(self, high: bool) -> None:
        asserted = not high
        if asserted != self.interrupt_asserted:
            self.interrupt_asserted = asserted
            self.on_interrupt_change(asserted)

    # ── I2C transport ─────────────────────────────────────────────────────────

    def handle_event(self, event: int) -> int:
        op   = event & 0xFF
        data = (event >> 8) & 0xFF

        if op in (I2C_START_RECV, I2C_START_SEND):
            if not self.powered:
                return 1
            self._start()
            return 0
        elif op in (I2C_FINISH, I2C_NACK):
            self._start()
            return 0
        elif op == I2C_WRITE:
            ack = self._write_byte(data)
            self._arm(self._clock())
            return 0 if ack else 1
        elif op == I2C_READ:
            return self._read_byte()
        else:
            raise ValueError(f'max17048: unsupported I2C event 0x{op:02x}')

    def _start(self) -> None:
        self.first_byte = True
        self.pending_high = None
        self.snapshot = None

    def _write_byte(self, value: int) -> bool:
        if not self.powered:
            return False
        if self.first_byte:
            self.pointer = value
            self.first_byte = False
            return True
        reg = self.pointer
        _require_register(reg)
        self.pointer = (reg + 1) & 0xFF
        if reg & 1 == 0:
            self.pending_high = value
            return True
        if self.pending_high is None:
            return True
        word = (self.pending_high << 8) | value
        self.pending_high = None
        return self._write_word(reg - 1, word)

    def _read_byte(self) -> int:
        if not self.powered:
            return 0xFF
        _require_register(self.pointer)
        if self.snapshot is None:
            self.snapshot = bytes(self.regs)
        value = self.snapshot[self.pointer]
        self.pointer = (self.pointer + 1) & 0xFF
        return value

    def _word(self, reg: int) -> int:
        return (self.regs[reg] << 8) | self.regs[reg + 1]

    def _put_word(self, reg: int, value: int) -> None:
        self.regs[reg] = (value >> 8) & 0xFF
        self.regs[reg + 1] = value & 0xFF

    def _write_word(self, reg: int, value: int) -> bool:
        if reg in (0x02, 0x04, 0x08, 0x16):
            return True
        elif reg == 0x06:
            self._put_word(reg, (value & 0x2000) | (0x1000 if self.hibernating else 0))
            if value & 0x4000:
                self.quick_start()
            self._sync_sleep()
            self._check_bus_sleep()
        elif reg == 0x0A:
            self._put_word(reg, value)
            self.low_rate_since_ns = None
            if value == 0xFFFF:
                self._set_hibernating(True)
            elif value == 0:
                self._set_hibernating(False)
            else:
                self._check_hibernation(True)
        elif reg == 0x0C:
            self._put_word(reg, value)
            self._drive_interrupt(not (value & 0x20))
            self._sync_sleep()
        elif reg == 0x14:
            self._put_word(reg, value)
        elif reg == 0x18:
            self.regs[reg] = value >> 8
            self._check_reset_comparator()
        elif reg == 0x1A:
            previous = self.regs[reg]
            self.regs[reg] = ((value >> 8) & 0x40) | (previous & (value >> 8) & 0x3F)
            if (previous & 0x20) and not (self.regs[reg] & 0x20):
                self.change_soc = self._current_soc()
                if not (self.regs[reg] & 0x1E):
                    self._clear_alert()
        elif reg == 0xFE:
            if value != 0x5400:
                raise ValueError(f'max17048: unsupported CMD 0x{value:x}')
            self._reset()
            return False
        else:
            raise ValueError(f'max17048: unsupported word register 0x{reg:x}')
        return True

    # ── Power, sleep and acquisition ──────────────────────────────────────────

    def _sync_power(self) -> None:
        powered = self.cell['batteryConnected'] and self.cell['cellVoltage'] >= 2.5
        if powered == self.powered:
            return
        self.powered = powered
        if powered:
            self._reset()
        else:
            self.generation += 1
            self.reset_generation += 1
            self.bus_generation += 1
            self._drive_interrupt(True)

    def _reset(self) -> None:
        self.regs[:] = bytes(256)
        self._put_word(0x08, 0x0012)
        self._put_word(0x0A, 0x8030)
        self._put_word(0x0C, 0x971C)
        self._put_word(0x14, 0x00FF)
        self._put_word(0x18, 0x9648)
        self._put_word(0x1A, 0x0100)
        self._put_word(0xFE, 0xFFFF)
        self.sleeping = False
        self.bus_sleeping = False
        self.hibernating = False
        self.adc_ready = False
        self.low_rate_since_ns = None
        self.below_reset = self.cell['cellVoltage'] < 3
        self.reset_generation += 1
        self.bus_generation += 1
        self._drive_interrupt(True)
        self.quick_start()

    def quick_start(self) -> None:
        if not self.powered:
            return
        self.seeded = False
        self._put_word(0x04, 0)
        self._put_word(0x16, 0)
        self.generation += 1
        generation = self.generation

        def seed() -> None:
            if not self._active(generation):
                return
            self.seeded = True
            self.change_soc = self._current_soc()
            self._sample_soc()

        # Known-cell inputs provide SOC truth; this models acquisition, not Maxim's unpublished estimator.
        self._schedule(seed, 192)
        self._queue_adc(generation)
        self._queue_soc(generation, 1000)

    def _check_bus_sleep(self) -> None:
        self.bus_generation += 1
        generation = self.bus_generation
        if not (self._word(0x06) & 0x2000) or self.bus_sda_high or self.bus_scl_high or not self.powered:
            return

        def sleep() -> None:
            if generation != self.bus_generation or not self.powered:
                return
            self.bus_sleeping = True
            self._sync_sleep()

        self._schedule(sleep, 2500)

    def _sync_sleep(self) -> None:
        sleeping = bool(self._word(0x06) & 0x2000) and (bool(self._word(0x0C) & 0x80) or self.bus_sleeping)
        if sleeping == self.sleeping:
            return
        self.sleeping = sleeping
        self.generation += 1
        generation = self.generation
        if not sleeping:
            if not self.seeded:
                self.quick_start()
            else:
                self._queue_adc(generation)
                self._queue_soc(generation, 45000 if self.hibernating else 1000)

    def _active(self, generation: int) -> bool:
        return self.powered and not self.sleeping and generation == self.generation

    def _queue_adc(self, generation: int) -> None:
        state = {'total': 0, 'samples': 0}

        def sample() -> None:
            if not self._active(generation):
                return
            state['total'] += js_round(self.cell['cellVoltage'] / 0.00125)
            state['samples'] += 1
            if state['samples'] == 4:
                self._put_word(0x02, state['total'] * 4)
                self.adc_ready = True
                self._check_voltage_alerts()
                self._check_hibernation(True)
                if not self._active(generation):
                    return
                self._queue_adc(generation)
            else:
                self._schedule(sample, 11250 if self.hibernating else 62.5)

        self._schedule(sample, 11250 if self.hibernating else 62.5)

    def _queue_soc(self, generation: int, delay_ms: float) -> None:
        def sample() -> None:
            if not self._active(generation):
                return
            if self.seeded:
                self._sample_soc()
            self._check_hibernation()
            if self._active(generation):
                self._queue_soc(generation, 45000 if self.hibernating else 1000)

        self._schedule(sample, delay_ms)

    def _sample_soc(self) -> None:
        soc = self._current_soc()
        self._put_word(0x04, js_round(soc * 256))
        self._put_word(0x16, js_round(self.cell['chargeRate'] / 0.208) & 0xFFFF)
        threshold = 32 - (self._word(0x0C) & 31)
        if self.previous_soc >= threshold > soc:
            self._raise_alert(0x10)
        if (self._word(0x0C) & 0x40) and abs(soc - self.change_soc) >= 1:
            self._raise_alert(0x20)
        self.previous_soc = soc

    def _check_voltage_alerts(self) -> None:
        voltage = self._word(0x02)
        if voltage < self.regs[0x14] * 256:
            self._raise_alert(0x04)
        if voltage > self.regs[0x15] * 256:
            self._raise_alert(0x02)
        if self.hibernating and (self.regs[0x18] & 1):
            self._check_reset_comparator()

    def _check_hibernation(self, check_activity: bool = False) -> None:
        config = self._word(0x0A)
        if config == 0xFFFF:
            self._set_hibernating(True)
            return
        if config == 0:
            self._set_hibernating(False)
            return
        difference = abs(self.cell['openCircuitVoltage'] - self._word(0x02) * 0.000078125)
        if check_activity and self.hibernating and difference > self.regs[0x0B] * 0.00125:
            self.low_rate_since_ns = None
            self._set_hibernating(False)
            return
        if abs(self.cell['chargeRate']) < self.regs[0x0A] * 0.208:
            if self.low_rate_since_ns is None:
                self.low_rate_since_ns = self._clock()
            if self._clock() - self.low_rate_since_ns >= 360_000 * MS_NS:
                self._set_hibernating(True)
        else:
            self.low_rate_since_ns = None

    def _set_hibernating(self, value: bool) -> None:
        if value == self.hibernating:
            return
        self.hibernating = value
        self._put_word(0x06, (self._word(0x06) & 0x2000) | (0x1000 if value else 0))
        self.generation += 1
        generation = self.generation
        if self.seeded:
            self._queue_adc(generation)
            self._queue_soc(generation, 45000 if value else 1000)
        else:
            self.quick_start()

    def _check_reset_comparator(self) -> None:
        if not self.powered or self.sleeping:
            return
        comparator_enabled = not self.hibernating or not (self.regs[0x18] & 1)
        if not comparator_enabled and not self.adc_ready:
            return
        voltage = self.cell['cellVoltage'] if comparator_enabled else self._word(0x02) * 0.000078125
        threshold = (self.regs[0x18] >> 1) * 0.04
        if voltage < threshold:
            self.below_reset = True
            self.reset_generation += 1
        elif self.below_reset:
            self.below_reset = False
            self.reset_generation += 1
            generation = self.reset_generation

            def recovered() -> None:
                if not self.powered or self.sleeping or generation != self.reset_generation:
                    return
                self.quick_start()
                self.regs[0x1A] |= 1
                if self.regs[0x1A] & 0x40:
                    self._raise_alert(0x08)

            self._schedule(recovered, 1 if comparator_enabled else 250)

    def _raise_alert(self, flag: int) -> None:
        self.regs[0x1A] |= flag
        self.regs[0x0D] |= 0x20
        self._drive_interrupt(False)

    def _clear_alert(self) -> None:
        self.regs[0x0D] &= ~0x20 & 0xFF
        self._drive_interrupt(True)

    # ── Clock ─────────────────────────────────────────────────────────────────

    def _schedule(self, callback, delay_ms: float) -> None:
        due = self._clock() + max(1, js_round(delay_ms * MS_NS))
        heapq.heappush(self._events, (due, next(self._seq), callback))

    def _arm(self, now_ns: int) -> None:
        if self._events and self._at is None:
            self.on_conversion_scheduled(max(self._events[0][0], now_ns))

    def tick(self, now_ns: int) -> None:
        """Run every step due by `now_ns`, each at its own deadline."""
        while self._events and self._events[0][0] <= now_ns:
            due, _, callback = heapq.heappop(self._events)
            self._at = due
            try:
                callback()
            finally:
                self._at = None
        self._arm(now_ns)


def check_cell(state: dict) -> None:
    """The element's input contract (validateCell in Max17048.ts)."""
    if not isinstance(state['batteryConnected'], bool):
        raise ValueError('max17048: batteryConnected must be boolean')
    for key, (low, high) in MAX17048_RANGES.items():
        value = state[key]
        if (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)
                or not low <= value <= high):
            raise ValueError(f'max17048: {key} must be finite and within {low}..{high}')


def _require_register(reg: int) -> None:
    if 0x02 <= reg <= 0x0D or 0x14 <= reg <= 0x1B or reg >= 0xFE:
        return
    if 0x3E <= reg <= 0x7F:
        kind = 'unlock' if reg < 0x40 else 'TABLE'
        raise ValueError(f'max17048: custom model {kind} register 0x{reg:x} is unsupported')
    raise ValueError(f'max17048: unsupported register 0x{reg:x}')
