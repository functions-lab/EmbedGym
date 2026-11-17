"""MPR121 12-electrode capacitive touch controller."""
from __future__ import annotations

import collections
import heapq
import itertools
import math

from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_NACK, I2C_READ, I2C_START_RECV, I2C_START_SEND, I2C_WRITE
from embedgym_parts.i2c.js_math import js_round


MPR121_ADDRESSES = (0x5A, 0x5B, 0x5C, 0x5D)
ELECTRODES = 12
GPIO_PINS = tuple(str(i + 4) for i in range(8))
MPR121_INPUTS = (*(f'capacitance{i}' for i in range(ELECTRODES)), 'rextOvercurrent', 'pressed')
# sensor_attach fields that describe the circuit, not physical inputs.
MPR121_CIRCUIT_FIELDS = ('powered', 'electrodes')
MS_NS = 1_000_000
VDD = 3.3
LOW_MAX = 0.99      # 0.3 VDD
HIGH_MIN = 2.31     # 0.7 VDD
MIN_STEP_MS = 0.0000625   # one 16 MHz cycle of the AVR part's clock
INT_ASSERTED = {'voltage': 0, 'resistance': 0.5 / 0.006}
PULL_OHMS = 100000


def check_inputs(inputs: dict) -> None:
    """The element's input contract (validateMpr121Inputs in Mpr121.ts)."""
    pressed = inputs['pressed']
    if (not isinstance(pressed, list) or len(pressed) != ELECTRODES or any(not isinstance(p, bool) for p in pressed)
            or not isinstance(inputs['rextOvercurrent'], bool)):
        raise ValueError('mpr121: invalid physical inputs')
    for value in inputs['capacitance']:
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 < value <= 100000:
            raise ValueError('mpr121: electrode capacitance must be finite within 0..100000 pF, excluding zero')


class MPR121Slave:
    """MPR121 register-map I2C slave (address 0x5A–0x5D), a port of
    VirtualMPR121 in parts/sim/Mpr121.ts, with the
    clock in virtual ns.

    Every scan, autoconfiguration and PWM step sits on one queue; the slave
    reports its earliest deadline through `on_conversion_scheduled(due_ns)`
    and the worker calls `tick(now_ns)` when that timer fires. `update` may
    arm an earlier deadline, so the worker calls it where it may arm the
    timer. A step left queued across a restart finds its generation stale
    and does nothing.

    `attach_circuit(fields)` takes whether VIN and GND are supplied
    (`powered`) before `power_on()`. The host resolves the part's pins on the
    circuit: the slave reports its own drive on INT and on electrodes 4–11
    through `on_pin_drive(pin, drive)` (a PinDrive, or None while it does not
    drive the pin), reads an electrode's node voltage through
    `pin_voltage(pin)`, and the host calls `pins_changed()` after a pin's
    voltage may have changed.
    """

    def __init__(self, addr: int, now_ns, on_conversion_scheduled=lambda due_ns: None) -> None:
        if addr not in MPR121_ADDRESSES:
            raise ValueError(f'mpr121: address must be 0x5A, 0x5B, 0x5C or 0x5D, got {addr:#x}')
        self.addr = addr
        self.now_ns = now_ns
        self.on_conversion_scheduled = on_conversion_scheduled
        self.inputs: dict = {'capacitance': [15] * ELECTRODES, 'pressed': [False] * ELECTRODES, 'rextOvercurrent': False}
        self.powered: bool | None = None
        self.started = False
        self.interrupt_asserted: bool | None = None
        self.registers = bytearray(0x85)
        self.baseline = [0] * 13
        self.pointer = 0
        self.first_byte = True
        self.snapshot: bytes | None = None
        self.generation = 0
        self.first_measurement = True
        self.touch = 0
        self.debounce = [0] * 13
        self.scenario = [-1] * 13
        self.noise = [0] * 13
        self.baseline_samples: list[list[int]] = [[] for _ in range(13)]
        self.second_samples: list[list[int]] = [[] for _ in range(13)]
        self.gpio_latch = 0
        self.gpio_input = 0
        self.pwm_phase = 0
        self.pwm_generation = 0
        self.pwm_running = False
        self.active_pwm = [0] * 8
        self.measuring = False
        self.pending_gpio = False
        self.auto_pending = False
        self._scan: dict | None = None
        self._events: list = []
        self._seq = itertools.count()
        self._at: int | None = None

    def on_pin_drive(self, part_pin: str, drive: dict | None) -> None:
        raise RuntimeError('mpr121: the host has not connected on_pin_drive')

    def pin_voltage(self, part_pin: str) -> float | None:
        raise RuntimeError('mpr121: the host has not connected pin_voltage')

    def attach_circuit(self, fields: dict) -> None:
        if not isinstance(fields.get('powered'), bool):
            raise ValueError('mpr121: powered must be boolean')
        self.powered = fields['powered']

    def power_on(self) -> None:
        if self.powered is None:
            raise RuntimeError('mpr121: attach_circuit must run before power_on')
        self.started = True
        self.reset()
        self._arm(self._clock())

    def update(self, values: dict) -> None:
        """`set <role>.capacitance<n>|rextOvercurrent`, and `pressed` from the
        element's touch actions; read by the next conversion."""
        candidate = {**self.inputs, 'capacitance': list(self.inputs['capacitance'])}
        for key, value in values.items():
            if key.startswith('capacitance') and key in MPR121_INPUTS:
                candidate['capacitance'][int(key[len('capacitance'):])] = value
            elif key in ('rextOvercurrent', 'pressed'):
                candidate[key] = value
            else:
                raise ValueError(f'mpr121: unknown physical input "{key}"')
        check_inputs(candidate)
        scan = self._scan
        live = self._take_samples(scan, self._clock())
        self.inputs = candidate
        if live and candidate['rextOvercurrent'] and scan['conversions']:
            self._schedule_overcurrent()
            self._arm(self._clock())

    def _clock(self) -> int:
        return self.now_ns() if self._at is None else self._at

    # ── I2C transport ─────────────────────────────────────────────────────────

    def _acknowledge(self) -> bool:
        return bool(self.powered) and self.started

    def handle_event(self, event: int) -> int:
        op = event & 0xFF
        data = (event >> 8) & 0xFF

        if op in (I2C_START_RECV, I2C_START_SEND):
            if not self._acknowledge():
                return 1
            self.first_byte = True
            self.snapshot = None
            self._set_interrupt(False)
            return 0
        elif op in (I2C_FINISH, I2C_NACK):
            self.first_byte = True
            self.snapshot = None
            return 0
        elif op == I2C_WRITE:
            ack = self._write_byte(data)
            self._arm(self._clock())
            return 0 if ack else 1
        elif op == I2C_READ:
            return self._read_byte()
        else:
            raise ValueError(f'mpr121: unsupported I2C event 0x{op:02x}')

    def _write_byte(self, value: int) -> bool:
        if not self._acknowledge():
            return False
        if self.first_byte:
            self.pointer = value
            self.first_byte = False
            return True
        self._write_register(self.pointer, value)
        self._advance_pointer()
        return True

    def _read_byte(self) -> int:
        if not self._acknowledge():
            raise ValueError('mpr121: unpowered device cannot return data')
        reg = self.pointer
        if reg in (0, 1, 0x75, 0x78, 0x79, 0x7A):
            self._update_gpio_inputs(True)
        if not _readable(reg):
            raise ValueError(f'mpr121: read from reserved register 0x{reg:x}')
        if self.snapshot is None:
            self._update_gpio_inputs()
            self._update_status()
            snapshot = bytearray(self.registers)
            for data in (0x75, 0x78, 0x79, 0x7A):
                snapshot[data] = self._gpio_data()
            self.snapshot = bytes(snapshot)
        result = self.snapshot[reg]
        self._advance_pointer()
        return result

    def _advance_pointer(self) -> None:
        self.pointer = 0 if self.pointer == 0x7F else self.pointer + 1

    def _running(self) -> bool:
        return bool(self.registers[0x5E] & 0x3F)

    def _electrode_count(self) -> int:
        return min(12, self.registers[0x5E] & 15)

    def _proximity_count(self) -> int:
        return (0, 2, 4, 12)[(self.registers[0x5E] >> 4) & 3]

    def _channels(self) -> list[int]:
        channels = list(range(self._electrode_count()))
        if self._proximity_count():
            channels.append(12)
        return channels

    def reset(self) -> None:
        self.generation += 1
        self.registers[:] = bytes(len(self.registers))
        self.registers[0x5C] = 0x10
        self.registers[0x5D] = 0x24
        self.baseline = [0] * 13
        self.touch = 0
        self.gpio_latch = 0
        self.gpio_input = 0
        self.first_measurement = True
        self.auto_pending = False
        self.measuring = False
        self._clear_filters()
        self._set_interrupt(False)
        self._restart_pwm()
        self._update_gpio_drives()

    def _clear_filters(self) -> None:
        self.debounce = [0] * 13
        self.scenario = [-1] * 13
        self.noise = [0] * 13
        self.baseline_samples = [[] for _ in range(13)]
        self.second_samples = [[] for _ in range(13)]

    def _write_register(self, reg: int, value: int) -> None:
        r = self.registers
        if reg == 0x80:
            if value != 0x63:
                raise ValueError('mpr121: soft reset requires command 0x63')
            self.reset()
            return
        if reg == 1:
            if value & 0x80:
                r[1] &= ~0x80 & 0xFF
            return
        if not _readable(reg) or reg < 0x1E:
            raise ValueError(f'mpr121: write to read-only or reserved register 0x{reg:x}')
        live = reg == 0x5E or 0x73 <= reg <= 0x7A or 0x81 <= reg <= 0x84
        # The datasheet permits configuration writes only in Stop Mode.
        if self._running() and not live:
            return
        if 0x1E <= reg <= 0x2A:
            r[reg] = value
            self.baseline[reg - 0x1E] = value << 2
        elif 0x2B <= reg <= 0x7F:
            if reg == 0x5E:
                was_running = self._running()
                if (r[1] & 0x80) and (value & 0x3F):
                    return
                r[reg] = value
                self.generation += 1
                self.measuring = False
                self._clear_filters()
                enabled_mask = ((1 << self._electrode_count()) - 1) | (0x1000 if self._proximity_count() else 0)
                self.touch &= enabled_mask
                if not was_running and self._running():
                    self.first_measurement = True
                    self.auto_pending = bool(r[0x7B] & 1)
                self._update_status()
                self._update_gpio_drives()
                if self._running():
                    self._queue_scan(self.generation)
            elif reg in (0x75, 0x78, 0x79, 0x7A):
                if reg == 0x75:
                    self.gpio_latch = value
                elif reg == 0x78:
                    self.gpio_latch |= value
                elif reg == 0x79:
                    self.gpio_latch &= ~value & 0xFF
                elif reg == 0x7A:
                    self.gpio_latch ^= value
                self._update_gpio_drives()
            else:
                mask = 0xFF
                if reg in (0x2B, 0x2C, 0x2F, 0x30, 0x33, 0x36, 0x37, 0x3A, 0x3B, 0x3E) or 0x5F <= reg <= 0x6B:
                    mask = 0x3F
                elif reg == 0x5B:
                    mask = 0x77
                elif 0x6C <= reg <= 0x71:
                    mask = 0x77
                elif reg == 0x72:
                    mask = 7
                elif reg == 0x7C:
                    mask = 0x87
                r[reg] = value & mask
                if 0x73 <= reg <= 0x77:
                    self._update_gpio_drives()
        elif 0x81 <= reg <= 0x84:
            r[reg] = value
            if not self.pwm_running:
                self._restart_pwm()
            self._update_gpio_drives()
        else:
            raise ValueError(f'mpr121: unsupported register 0x{reg:x}')

    # ── Conversion ────────────────────────────────────────────────────────────

    def _capacitance(self, channel: int) -> float:
        caps = self.inputs['capacitance']
        pressed = self.inputs['pressed']

        def total(i: int) -> float:
            return caps[i] + (10 if pressed[i] else 0)

        if channel == 12:
            result = 0
            for i in range(self._proximity_count()):
                result = result + total(i)
            return result
        return total(channel)

    def _current(self, channel: int) -> int:
        return self.registers[0x5F + channel] or (self.registers[0x5C] & 63)

    def _time_code(self, channel: int) -> int:
        individual = (self.registers[0x6C + (channel >> 1)] >> ((channel & 1) * 4)) & 7
        return individual or (self.registers[0x5D] >> 5)

    @staticmethod
    def _charge_time(code: int) -> float:
        return 0 if code == 0 else 2 ** (code - 2)

    def _adc(self, channel: int, current: int | None = None, time_code: int | None = None) -> int:
        current = self._current(channel) if current is None else current
        time_code = self._time_code(channel) if time_code is None else time_code
        value = math.floor(current * self._charge_time(time_code) * 1024 / (3.3 * self._capacitance(channel)))
        return max(0, min(1023, value))

    def _queue_scan(self, generation: int) -> None:
        channels = self._channels()
        ffi = (6, 10, 18, 34)[self.registers[0x5C] >> 6]
        samples: list[list[int]] = [[] for _ in range(13)]
        self.measuring = True
        scan_ms = 0.0
        for channel in channels:
            scan_ms += ffi * max(2 * self._charge_time(self._time_code(channel)) / 1000, MIN_STEP_MS)
        conversions: collections.deque = collections.deque()
        elapsed = 0.0
        for channel in channels:
            for _ in range(ffi):
                elapsed += max(2 * self._charge_time(self._time_code(channel)) / 1000, MIN_STEP_MS)
                conversions.append((self._due(elapsed), channel))
        scan = self._scan = {'generation': generation, 'conversions': conversions, 'samples': samples}

        def next_scan() -> None:
            def rescan() -> None:
                if generation == self.generation:
                    self._queue_scan(generation)
            self._schedule(rescan, max(MIN_STEP_MS, 2 ** (self.registers[0x5D] & 7) - scan_ms))

        def complete_scan() -> None:
            self.measuring = False
            if self.pending_gpio:
                self.pending_gpio = False
                self._update_gpio_drives()
            if self.auto_pending:
                self.auto_pending = False
                self._queue_auto_configuration(False, generation, next_scan)
                return
            for channel in channels:
                ordered = sorted(samples[channel])
                self.second_samples[channel].append(math.floor(sum(ordered[1:-1]) / (ffi - 2)))
            sfi = (4, 6, 10, 18)[(self.registers[0x5D] >> 3) & 3]
            if len(self.second_samples[channels[0]]) == sfi:
                self._complete_measurement(channels)
                for channel in channels:
                    self.second_samples[channel] = []
            if (self.registers[0x7B] & 2) and any(self._needs_reconfiguration(channel) for channel in channels):
                self._queue_auto_configuration(True, generation, next_scan)
            else:
                next_scan()

        last_due = conversions[-1][0]

        def finish() -> None:
            if self._take_samples(scan, last_due):
                complete_scan()

        self._schedule_at(last_due, finish)
        if self.inputs['rextOvercurrent']:
            self._schedule_overcurrent()

    def _take_samples(self, scan: dict | None, until_ns: int) -> bool:
        """Run the scan's conversions due by `until_ns`. A conversion reads only
        the physical inputs and Stop-Mode registers, so conversions run lazily,
        at the scan's end or before `update` changes the inputs, instead of one
        timer each. False when the scan is stale or tripped the overcurrent
        fault."""
        if scan is None or scan is not self._scan or scan['generation'] != self.generation:
            return False
        conversions = scan['conversions']
        while conversions and conversions[0][0] <= until_ns:
            _, channel = conversions.popleft()
            if self.inputs['rextOvercurrent']:
                self._overcurrent()
                return False
            scan['samples'][channel].append(self._adc(channel))
        return True

    def _schedule_overcurrent(self) -> None:
        """The scan's next conversion trips the fault at its own deadline."""
        scan = self._scan
        due = scan['conversions'][0][0]
        self._schedule_at(due, lambda: self._take_samples(scan, due))

    def _complete_measurement(self, channels: list[int]) -> None:
        r = self.registers
        previous_touch = self.touch
        for channel in channels:
            samples = self.second_samples[channel]
            data = math.floor(sum(samples) / len(samples))
            r[4 + 2 * channel] = data & 255
            r[5 + 2 * channel] = data >> 8
            cl = r[0x5E] >> 6
            if self.first_measurement and not (r[0x7B] & 1):
                if cl == 2:
                    self.baseline[channel] = data & 0x3E0
                elif cl == 3:
                    self.baseline[channel] = data
            bit = 1 << channel
            touched = bool(self.touch & bit)
            delta = self.baseline[channel] - data
            detected = delta < r[0x42 + 2 * channel] if touched else delta > r[0x41 + 2 * channel]
            if detected:
                self.debounce[channel] += 1
                required = ((r[0x5B] >> (4 if touched else 0)) & 7) + 1
                if self.debounce[channel] >= required:
                    self.touch ^= bit
                    self.debounce[channel] = 0
            else:
                self.debounce[channel] = 0
            if cl != 1:
                self._track_baseline(channel, data)
            r[0x1E + channel] = self.baseline[channel] >> 2
        self.first_measurement = False
        self._update_gpio_inputs()
        self._update_status()
        if previous_touch != self.touch:
            self._set_interrupt(True)
        self._fault_interrupt()

    def _track_baseline(self, channel: int, data: int) -> None:
        r = self.registers
        touched = bool(self.touch & (1 << channel))
        scenario = 2 if touched else (0 if data >= self.baseline[channel] else 1)
        if scenario != self.scenario[channel]:
            self.scenario[channel] = scenario
            self.noise[channel] = 0
            self.baseline_samples[channel] = []
        base = 0x36 if channel == 12 else 0x2B
        config = base + (8 if scenario == 2 else scenario * 4)
        nhd = r[config + (0 if scenario == 2 else 1)]
        ncl = r[config + (1 if scenario == 2 else 2)]
        fdl = r[config + (2 if scenario == 2 else 3)]
        samples = self.baseline_samples[channel]
        samples.append(data)
        if len(samples) < min(255, fdl + 1):
            return
        averaged = math.floor(sum(samples) / len(samples))
        self.baseline_samples[channel] = []
        delta = averaged - self.baseline[channel]
        if scenario != 2 and abs(delta) < 2 * r[config]:
            self.baseline[channel] = averaged
            self.noise[channel] = 0
        elif nhd > 0:
            self.noise[channel] += 1
            if self.noise[channel] >= min(255, ncl + 1):
                step = (delta > 0) - (delta < 0)
                self.baseline[channel] = max(0, min(1023, self.baseline[channel] + step * min(nhd, abs(delta))))
                self.noise[channel] = 0

    def _set_oor(self, channel: int, value: bool) -> None:
        reg = 2 if channel < 8 else 3
        mask = 1 << (channel if channel < 8 else channel - 8)
        if value:
            self.registers[reg] |= mask
        else:
            self.registers[reg] &= ~mask & 0xFF

    def _needs_reconfiguration(self, channel: int) -> bool:
        r = self.registers
        failed = bool(r[2 if channel < 8 else 3] & (1 << (channel if channel < 8 else channel - 8)))
        drifted = bool(r[0x7B] & 1) and (self.baseline[channel] < (r[0x7E] << 2) or self.baseline[channel] > (r[0x7D] << 2))
        return failed or drifted

    def _queue_auto_configuration(self, reconfigure: bool, generation: int, done) -> None:
        r = self.registers
        channels = [channel for channel in self._channels() if not reconfigure or self._needs_reconfiguration(channel)]
        retries = (0, 2, 4, 8)[(r[0x7B] >> 4) & 3]
        ffi = (6, 10, 18, 34)[r[0x7B] >> 6]
        state = {'failed': False, 'index': 0}

        def next_channel() -> None:
            if generation != self.generation:
                return
            if state['index'] == len(channels):
                flag = 0x40 if reconfigure else 0x80
                if state['failed']:
                    r[3] |= flag
                else:
                    r[3] &= ~flag & 0xFF
                self._fault_interrupt()
                done()
                return
            channel = channels[state['index']]
            times = [self._time_code(channel)] if r[0x7C] & 0x80 else [1, 2, 3, 4, 5, 6, 7]
            trial_state = {'attempt': 0, 'time_index': 0, 'current': 1, 'best': None}

            def finish_channel() -> None:
                best = trial_state['best']
                self._set_oor(channel, best is None)
                if best is None:
                    state['failed'] = True
                else:
                    r[0x5F + channel] = best['current']
                    if not (r[0x7C] & 0x80):
                        reg = 0x6C + (channel >> 1)
                        shift = (channel & 1) * 4
                        r[reg] = (r[reg] & ~(7 << shift) & 0xFF) | (best['time'] << shift)
                    bva = (r[0x7B] >> 2) & 3
                    if bva == 1:
                        self.baseline[channel] = 0
                    elif bva == 2:
                        self.baseline[channel] = best['adc'] & ~7
                    elif bva == 3:
                        self.baseline[channel] = best['adc']
                    r[0x1E + channel] = self.baseline[channel] >> 2
                state['index'] += 1
                next_channel()

            def trial() -> None:
                if generation != self.generation:
                    return
                if trial_state['time_index'] == len(times):
                    if trial_state['best'] is None and trial_state['attempt'] < retries:
                        trial_state['attempt'] += 1
                        trial_state['time_index'] = 0
                        trial_state['current'] = 1
                    else:
                        finish_channel()
                        return
                time = times[trial_state['time_index']]
                current = trial_state['current']
                samples: list[int] = []
                delay = max(MIN_STEP_MS, 2 * self._charge_time(time) / 1000)
                self.measuring = True
                for i in range(ffi):
                    def sample(i=i) -> None:
                        if generation != self.generation:
                            return
                        if self.inputs['rextOvercurrent']:
                            self._overcurrent()
                            return
                        samples.append(self._adc(channel, current, time))
                        if i != ffi - 1:
                            return
                        self.measuring = False
                        if self.pending_gpio:
                            self.pending_gpio = False
                            self._update_gpio_drives()
                        samples.sort()
                        adc = math.floor(sum(samples[1:-1]) / (ffi - 2))
                        if (255 > r[0x7D] > r[0x7F] > r[0x7E] > 0
                                and (r[0x7E] << 2) <= adc <= (r[0x7D] << 2)):
                            distance = abs(adc - (r[0x7F] << 2))
                            best = trial_state['best']
                            if best is None or distance < best['distance']:
                                trial_state['best'] = {'current': current, 'time': time, 'adc': adc, 'distance': distance}
                        trial_state['current'] += 1
                        if trial_state['current'] > 63:
                            trial_state['current'] = 1
                            trial_state['time_index'] += 1
                        trial()

                    self._schedule(sample, delay * (i + 1))

            trial()

        next_channel()

    def _fault_interrupt(self) -> None:
        enable = self.registers[0x7C]
        r = self.registers
        if (((enable & 1) and (r[3] & 0x80)) or ((enable & 2) and (r[3] & 0x40))
                or ((enable & 4) and (r[2] or (r[3] & 31)))):
            self._set_interrupt(True)

    def _overcurrent(self) -> None:
        self.registers[0:0x2B] = bytes(0x2B)
        self.registers[1] = 0x80
        self.registers[0x5E] &= 0xC0
        self.baseline = [0] * 13
        self.touch = 0
        self.generation += 1
        self.measuring = False
        self._update_gpio_drives()
        self._set_interrupt(True)

    def _update_status(self) -> None:
        gpio_mask = self._active_gpio() & ~self.registers[0x76]
        status = self.touch | ((self.gpio_input & gpio_mask) << 4)
        self.registers[0] = status & 255
        self.registers[1] = (self.registers[1] & 0x80) | (status >> 8)

    def _active_gpio(self) -> int:
        sensing = ((1 << self._electrode_count()) - 1) | ((1 << self._proximity_count()) - 1)
        return self.registers[0x77] & ~(sensing >> 4) & 0xFF

    def _gpio_data(self) -> int:
        return (self.gpio_latch & self.registers[0x76]) | (self.gpio_input & ~self.registers[0x76] & 0xFF)

    # ── Pins ──────────────────────────────────────────────────────────────────

    def pins_changed(self) -> None:
        """A pin's voltage may have changed: the firmware moved a GPIO, or the circuit changed."""
        if not self.started:
            return
        self._update_gpio_inputs()
        self._update_status()

    def _set_interrupt(self, asserted: bool) -> None:
        asserted = asserted and bool(self.powered)
        if asserted == self.interrupt_asserted:
            return
        self.interrupt_asserted = asserted
        self.on_pin_drive('INT', INT_ASSERTED if asserted else None)

    def _drive(self, pin: str, contribution: dict | None) -> None:
        self.on_pin_drive(pin, contribution if self.powered else None)

    def _update_gpio_inputs(self, require_known: bool = False) -> None:
        for i in range(8):
            bit = 1 << i
            if not (self._active_gpio() & bit) or (self.registers[0x76] & bit):
                continue
            voltage = self.pin_voltage(str(i + 4))
            if voltage is not None and (voltage < -0.3 or voltage > 3.6):
                raise ValueError(f'mpr121: GPIO electrode {i + 4} input exceeds VDD+0.3V rating')
            if voltage is None or LOW_MAX < voltage < HIGH_MIN:
                if require_known:
                    raise ValueError(f'mpr121: GPIO electrode {i + 4} input has '
                                     f'{"floating" if voltage is None else "indeterminate"} voltage')
                continue
            if voltage >= HIGH_MIN:
                self.gpio_input |= bit
            else:
                self.gpio_input &= ~bit & 0xFF

    def _update_gpio_drives(self) -> None:
        if self.measuring:
            self.pending_gpio = True
            return
        r = self.registers
        for i in range(8):
            bit = 1 << i
            drive = None
            if self._active_gpio() & bit:
                control = ((r[0x73] >> i) & 1) | (((r[0x74] >> i) & 1) << 1)
                if r[0x76] & bit:
                    duty = self.active_pwm[i]
                    high = bool(self.gpio_latch & bit) and (duty == 0 or self.pwm_phase < duty)
                    if control in (0, 1) or (control == 2 and not high) or (control == 3 and high):
                        drive = {'voltage': VDD if high else 0, 'resistance': 0.5 / 0.010 if high else 0.5 / 0.001}
                elif control in (2, 3):
                    drive = {'voltage': VDD if control == 3 else 0, 'resistance': PULL_OHMS}
            self._drive(str(i + 4), drive)

    def _restart_pwm(self) -> None:
        self.pwm_generation += 1
        generation = self.pwm_generation
        self.pwm_phase = 0

        def apply() -> None:
            for i in range(8):
                self.active_pwm[i] = (self.registers[0x81 + (i >> 1)] >> ((i & 1) * 4)) & 15
            self.pwm_running = any(value != 0 for value in self.active_pwm)

        apply()
        if not self.pwm_running:
            return

        def tick() -> None:
            if generation != self.pwm_generation:
                return
            self.pwm_phase = (self.pwm_phase + 1) & 15
            if self.pwm_phase == 0:
                apply()
            self._update_gpio_drives()
            if self.pwm_running:
                self._schedule(tick, 0.5)

        self._schedule(tick, 0.5)

    # ── Clock ─────────────────────────────────────────────────────────────────

    def _due(self, delay_ms: float) -> int:
        return self._clock() + max(1, js_round(delay_ms * MS_NS))

    def _schedule(self, callback, delay_ms: float) -> None:
        self._schedule_at(self._due(delay_ms), callback)

    def _schedule_at(self, due: int, callback) -> None:
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


def _readable(reg: int) -> bool:
    return 0 <= reg <= 0x7F or 0x81 <= reg <= 0x84
