"""HMC5883L 3-axis magnetometer."""
from __future__ import annotations

import heapq
import itertools
import math

from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_NACK, I2C_READ, I2C_START_RECV, I2C_START_SEND, I2C_WRITE
from embedgym_parts.i2c.js_math import js_round


HMC5883L_ADDR = 0x1E
HMC5883L_GAINS = [1370, 1090, 820, 660, 440, 390, 330, 230]
HMC5883L_RATES_HZ = [0.75, 1.5, 3, 7.5, 15, 30, 75]
HMC5883L_FIELD_LIMIT = 100
MS_NS = 1_000_000
SINGLE_MEASUREMENT_NS = 6 * MS_NS
POWER_ON_SETTLE_NS = 56 * MS_NS
DRDY_PULSE_NS = 250_000
STATUS_HOLD_NS = 250_000

# Event kinds on the model's virtual-clock queue. A configuration write drops
# the pending samples and status re-set; the DRDY release always runs.
SAMPLE = 'sample'
READY = 'ready'
DRDY_RELEASE = 'drdy_release'


class HMC5883LSlave:
    """HMC5883L register-map I2C slave (address 0x1E), a port of VirtualHMC5883L
    in parts/sim/Hmc5883l.ts, with the clock in
    virtual ns.

    The AVR part schedules each sample, the status re-set and the DRDY release
    on the CPU clock; here they sit on one queue, the slave reports its earliest
    deadline through `on_measurement_scheduled(due_ns)`, and the worker calls
    `tick(now_ns)` when that timer fires. Each event runs at its own deadline.
    `on_interrupt_change(asserted)` drives DRDY (True = pin LOW). The worker
    calls `power_on()` once both hooks are in place; it starts the 56 ms
    power-on measurement.
    """

    def __init__(self, now_ns, on_interrupt_change=lambda asserted: None,
                 on_measurement_scheduled=lambda due_ns: None) -> None:
        self.addr = HMC5883L_ADDR
        self.regs = bytearray([0x10, 0x20, 0x01, 0, 0, 0, 0, 0, 0, 0, 0x48, 0x34, 0x33])
        self.reg_ptr = 0
        self.first_byte = True
        self.read_mask = 0
        self.locked = False
        self.ready = False
        self.ready_cleared_until_ns = 0
        self.effective_gain = 1
        self.field = [0.3, -0.2, 0.1]
        self.power_on_ns = 0
        self.now_ns = now_ns
        self.on_interrupt_change = on_interrupt_change
        self.on_measurement_scheduled = on_measurement_scheduled
        self._events: list[tuple[int, int, str]] = []
        self._seq = itertools.count()
        self._samples = 1
        self._samples_taken = 0
        self._sums = [0.0, 0.0, 0.0]

    def power_on(self) -> None:
        self.power_on_ns = self.now_ns()
        self._restart(self.power_on_ns)

    def update(self, magnetic_x: float | None = None, magnetic_y: float | None = None,
               magnetic_z: float | None = None) -> None:
        """`set <role>.magneticX|Y|Z` in gauss — sampled by the next measurement."""
        for axis, (name, value) in enumerate((('magneticX', magnetic_x), ('magneticY', magnetic_y),
                                              ('magneticZ', magnetic_z))):
            if value is None:
                continue
            if not math.isfinite(value) or abs(value) > HMC5883L_FIELD_LIMIT:
                raise ValueError(f'hmc5883l: {name} must be finite and within -100..100 gauss, got {value}')
            self.field[axis] = value

    # ── I2C transport ─────────────────────────────────────────────────────────

    def handle_event(self, event: int) -> int:
        op   = event & 0xFF
        data = (event >> 8) & 0xFF

        if op in (I2C_START_RECV, I2C_START_SEND, I2C_FINISH, I2C_NACK):
            # The pointer survives STOP and repeated START.
            self.first_byte = True
            return 0
        elif op == I2C_WRITE:
            if self.first_byte:
                self.reg_ptr = data
                self.first_byte = False
            else:
                self._write_register(self.reg_ptr, data)
                self._advance_pointer()
            return 0
        elif op == I2C_READ:
            value = self._read_register(self.reg_ptr)
            self._advance_pointer()
            return value
        else:
            raise ValueError(f'hmc5883l: unsupported I2C event 0x{op:02x}')

    def _write_register(self, reg: int, value: int) -> None:
        if reg == 0:
            config = value & 0x7F
            if (config >> 2) & 7 == 7 or config & 3 == 3:
                raise ValueError('hmc5883l: reserved output rate or measurement configuration')
            changed = self.regs[0] != config
            self.regs[0] = config
            if changed:
                self._unlock()
            self._restart(self.now_ns())
        elif reg == 1:
            self.regs[1] = value & 0xE0
            self._restart(self.now_ns())
        elif reg == 2:
            mode = value & 0x83
            if self.regs[2] != mode:
                self._unlock()
            self.regs[2] = mode
            self._restart(self.now_ns())
        # Honeywell defines writes to read-only/reserved registers as ignored.

    def _read_register(self, reg: int) -> int:
        if reg == 9:
            return (2 if self.locked else 0) | (1 if self.ready else 0)
        if reg >= len(self.regs):
            return 0
        if reg == 2:
            self.locked = True
        elif 3 <= reg <= 8:
            self.ready = False
            self.ready_cleared_until_ns = self.now_ns() + STATUS_HOLD_NS
            self.read_mask |= 1 << (reg - 3)
            self.locked = True
            if self.read_mask == 0x3F:
                self._unlock()
        return self.regs[reg]

    def _advance_pointer(self) -> None:
        if self.reg_ptr == 8:
            self.reg_ptr = 3
        elif self.reg_ptr == 12:
            self.reg_ptr = 0
        else:
            self.reg_ptr = (self.reg_ptr + 1) & 0xFF

    def _unlock(self) -> None:
        self.locked = False
        self.read_mask = 0

    # ── Measurement clock ─────────────────────────────────────────────────────

    def tick(self, now_ns: int) -> None:
        """Run every event due by `now_ns`, each at its own deadline."""
        while self._events and self._events[0][0] <= now_ns:
            due, _, kind = heapq.heappop(self._events)
            if kind == SAMPLE:
                self._sample(due)
            elif kind == READY:
                if due >= self.ready_cleared_until_ns:
                    self.ready = True
            elif kind == DRDY_RELEASE:
                self.on_interrupt_change(False)
            else:
                raise ValueError(f'hmc5883l: unknown event {kind!r}')
        self._arm(now_ns)

    def _push(self, due_ns: int, kind: str) -> None:
        heapq.heappush(self._events, (due_ns, next(self._seq), kind))

    def _arm(self, now_ns: int) -> None:
        if self._events:
            self.on_measurement_scheduled(max(self._events[0][0], now_ns))

    def _restart(self, now_ns: int) -> None:
        self._events = [e for e in self._events if e[2] == DRDY_RELEASE]
        heapq.heapify(self._events)
        mode = self.regs[2] & 3
        if mode in (0, 1):
            self.ready = False
            if mode == 0:
                delay_ns = round(2000 * MS_NS / HMC5883L_RATES_HZ[(self.regs[0] >> 2) & 7])
            else:
                delay_ns = SINGLE_MEASUREMENT_NS
            self._queue_measurement(now_ns, max(delay_ns, self.power_on_ns + POWER_ON_SETTLE_NS - now_ns))
        self._arm(now_ns)

    def _queue_measurement(self, now_ns: int, delay_ns: int) -> None:
        """Averaged samples spread over the measurement's final 6 ms."""
        self._samples = 1 << ((self.regs[0] >> 5) & 3)
        self._samples_taken = 0
        self._sums = [0.0, 0.0, 0.0]
        for i in range(self._samples):
            offset = delay_ns - SINGLE_MEASUREMENT_NS + round((i + 1) * SINGLE_MEASUREMENT_NS / self._samples)
            self._push(now_ns + offset, SAMPLE)

    def _sample(self, at_ns: int) -> None:
        for axis in range(3):
            self._sums[axis] += self.field[axis]
        self._samples_taken += 1
        if self._samples_taken < self._samples:
            return
        self._complete(at_ns, [total / self._samples for total in self._sums])
        if self.regs[2] & 3 == 0:
            period_ns = round(1000 * MS_NS / HMC5883L_RATES_HZ[(self.regs[0] >> 2) & 7])
            self._queue_measurement(at_ns, period_ns)

    def _complete(self, at_ns: int, ambient: list[float]) -> None:
        gain = HMC5883L_GAINS[self.effective_gain]
        self.effective_gain = self.regs[1] >> 5
        bias = self.regs[0] & 3
        if not self.locked:
            counts = [self._count(field, axis, bias, gain) for axis, field in enumerate(ambient)]
            for index, count in enumerate((counts[0], counts[2], counts[1])):
                self.regs[3 + index * 2] = (count >> 8) & 0xFF
                self.regs[4 + index * 2] = count & 0xFF
            self.ready = at_ns >= self.ready_cleared_until_ns
            if not self.ready:
                self._push(self.ready_cleared_until_ns, READY)
            self.on_interrupt_change(True)
            self._push(at_ns + DRDY_PULSE_NS, DRDY_RELEASE)
        if self.regs[2] & 3 == 1:
            self.regs[2] = (self.regs[2] & 0x80) | 2

    @staticmethod
    def _count(field: float, axis: int, bias: int, gain: int) -> int:
        """One axis's output count; -4096 when the reading, or with self-test
        bias the ambient or biased acquisition, leaves the 12-bit range."""
        if bias == 0:
            measured = field
        elif bias == 1:
            measured = 1.08 if axis == 2 else 1.16
        elif bias == 2:
            measured = -1.08 if axis == 2 else -1.16
        else:
            raise ValueError(f'hmc5883l: reserved bias {bias}')
        count = js_round(measured * gain)
        in_range = [count]
        if bias != 0:
            in_range += [js_round(field * gain), js_round((field + measured) * gain)]
        return -4096 if any(c < -2048 or c > 2047 for c in in_range) else count
