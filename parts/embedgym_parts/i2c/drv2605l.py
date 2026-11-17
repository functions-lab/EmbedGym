"""DRV2605L haptic driver (Adafruit 2305 breakout) driving an ERM coin motor."""
from __future__ import annotations

from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_NACK, I2C_READ, I2C_START_RECV, I2C_START_SEND, I2C_WRITE


DRV2605L_ADDR = 0x5A
MS_NS = 1_000_000

STATUS = 0x00
MODE = 0x01
RTP_INPUT = 0x02
LIBRARY = 0x03
SEQUENCE = range(0x04, 0x0C)
GO = 0x0C
TIME_OFFSETS = range(0x0D, 0x11)
FEEDBACK = 0x1A
CONTROL2 = 0x1C
CONTROL3 = 0x1D
CONTROL4 = 0x1E
CONTROL5 = 0x1F
VBAT = 0x21
LRA_PERIOD = 0x22
LAST_REGISTER = 0x22

DEVICE_ID = 7 << 5
DIAG_RESULT = 0x08
DEV_RESET = 0x80
STANDBY = 0x40
HI_Z = 0x10
WAIT = 0x80
N_ERM_LRA = 0x80
BIDIR_INPUT = 0x80
ERM_OPEN_LOOP = 0x20
DATA_FORMAT_RTP = 0x08
OTP_PROGRAM = 0x01
PLAYBACK_INTERVAL = 0x10

MODE_INTERNAL_TRIGGER = 0
MODE_RTP = 5
MODE_DIAGNOSTICS = 6
MODE_AUTO_CALIBRATION = 7

# Reset values from the register field tables (§8.6.1-8.6.28), which win where
# the register map summary (Table 3) disagrees: 0x04 is 0x00 (map: 0x01),
# 0x19 is 0x6F (map: 0x6C), 0x20 is 0x00 (map: 0x33). 0x17 takes Table 20's
# 0x8C over its bit figure's 0x9C. 0x21/0x22 are not modeled.
RESET_VALUES = {
    0x00: DEVICE_ID, 0x01: 0x40, 0x02: 0x00, 0x03: 0x01, **{reg: 0x00 for reg in SEQUENCE}, 0x0C: 0x00,
    **{reg: 0x00 for reg in TIME_OFFSETS}, 0x11: 0x05, 0x12: 0x19, 0x13: 0xFF, 0x14: 0x19, 0x15: 0xFF,
    0x16: 0x3E, 0x17: 0x8C, 0x18: 0x0C, 0x19: 0x6F, 0x1A: 0x36, 0x1B: 0x93, 0x1C: 0xF5, 0x1D: 0xA0,
    0x1E: 0x20, 0x1F: 0x80, 0x20: 0x00,
}
# Writable bits; reserved bits read 0. STATUS is read-only and OTP_STATUS (0x1E bit 2) too.
WRITE_MASKS = {
    **{reg: 0xFF for reg in RESET_VALUES}, MODE: 0xC7, LIBRARY: 0x17, GO: 0x01, 0x11: 0x0F, 0x1B: 0xBF,
    CONTROL4: 0xF1, 0x20: 0x7F,
}

# The datasheet gives no per-effect durations, only each ERM library's rise and
# brake time ranges (Table 1). Every ROM effect is modeled as lasting the
# library's longest rise plus its longest brake: Library A 60 + 40 = 100 ms.
# Library E (open-ended ranges), the LRA library and the empty one have none.
EFFECT_MS = {1: 60 + 40, 2: 60 + 15, 3: 80 + 20, 4: 140 + 25, 7: 45 + 20}
LAST_EFFECT_ID = 123
WAIT_STEP_MS = 10
# Diagnostics: the datasheet gives no duration; modeled as 100 ms.
DIAGNOSTICS_MS = 100
# Auto-calibration lasts the AUTO_CAL_TIME maximum (0x1E bits 5:4).
AUTO_CAL_MS = (350, 450, 700, 1200)


class DRV2605LSlave:
    """Register-map I2C slave at 0x5A with an auto-incrementing pointer.

    Mode 0 plays the waveform sequencer (0x04-0x0B) on GO: each slot is read
    when the sequencer reaches it, a WAIT slot idles 10 ms per step, and GO
    stays high until a zero slot or the eighth slot ends; clearing GO cancels.
    Mode 5 drives RTP_INPUT, signed or unsigned per DATA_FORMAT_RTP. Modes 6
    and 7 run diagnostics or auto-calibration on GO, which then self-clears
    with DIAG_RESULT 0 (the motor is connected and calibrates to the current
    A_CAL_COMP / A_CAL_BEMF / BEMF_GAIN). Only open-loop ERM playback with
    bidirectional input is modeled.

    `on_playback_scheduled(due_ns)` arms the host timer that calls
    `tick(now_ns)`; `on_state(values)` reports the element's observables;
    `set_time_origin(t_ns)` gives the target's time origin for `lastEffectMs`.
    """

    def __init__(self, now_ns) -> None:
        self.addr = DRV2605L_ADDR
        self.now_ns = now_ns
        self.on_playback_scheduled = lambda due_ns: None
        self.on_state = lambda values: None
        self.origin_ns: int | None = None
        self.regs = dict(RESET_VALUES)
        self.ptr = 0
        self.expect_pointer = False
        # The running GO process: 'sequence', 'diagnostics' or 'calibration'.
        self.process: str | None = None
        self.slot = 0
        self.due_ns: int | None = None
        self.effect_playing = False
        self.effect_count = 0
        self.last_effect = 0
        self.last_effect_ms = -1.0
        self.effects: list[int] = []
        self.reported: dict = {}

    def power_on(self) -> None:
        self._report()

    def set_time_origin(self, t_ns: int) -> None:
        self.origin_ns = t_ns

    # ── I2C transport ─────────────────────────────────────────────────────────

    def handle_event(self, event: int) -> int:
        op = event & 0xFF
        data = (event >> 8) & 0xFF
        if op == I2C_START_SEND:
            self.expect_pointer = True
            return 0
        elif op == I2C_START_RECV:
            self.expect_pointer = False
            return 0
        elif op == I2C_WRITE:
            if self.expect_pointer:
                self.ptr = data
                self.expect_pointer = False
            else:
                self._write(self.ptr, data)
                self.ptr += 1
            return 0
        elif op == I2C_READ:
            value = self._read(self.ptr)
            self.ptr += 1
            return value
        elif op in (I2C_FINISH, I2C_NACK):
            return 0
        else:
            raise ValueError(f'drv2605l: unsupported I2C event 0x{op:02x}')

    def _check_register(self, reg: int, access: str) -> None:
        if reg > LAST_REGISTER:
            raise ValueError(f'drv2605l: {access} of register 0x{reg:02x}; the register map ends at 0x22')
        if reg in (VBAT, LRA_PERIOD):
            raise ValueError(f'drv2605l: register 0x{reg:02x} ({"VBAT" if reg == VBAT else "LRA_PERIOD"}) is not modeled')

    def _read(self, reg: int) -> int:
        self._check_register(reg, 'read')
        value = self.regs[reg]
        if reg == STATUS:
            # DIAG_RESULT clears upon read.
            self.regs[STATUS] = DEVICE_ID
        return value

    def _write(self, reg: int, value: int) -> None:
        self._check_register(reg, 'write')
        if reg == STATUS:
            raise ValueError('drv2605l: STATUS (0x00) is read-only')
        value &= WRITE_MASKS[reg]
        if reg == MODE:
            self._write_mode(value)
        elif reg == GO:
            self._write_go(value)
        elif reg == LIBRARY and value & HI_Z:
            raise ValueError('drv2605l: the HI_Z output state (0x03 bit 4) is not modeled')
        elif reg == CONTROL4 and value & OTP_PROGRAM:
            raise ValueError('drv2605l: OTP programming (0x1E bit 0) is not modeled')
        else:
            self.regs[reg] = value
            self._check_rtp()
        self._report()

    def _write_mode(self, value: int) -> None:
        if value & DEV_RESET:
            # Power-cycle equivalent: playback stops, every register resets and DEV_RESET self-clears.
            self._stop()
            self.regs = dict(RESET_VALUES)
            return
        mode = value & 7
        if 1 <= mode <= 4:
            raise ValueError(f'drv2605l: MODE {mode} (external trigger, PWM/analog or audio-to-vibe input on '
                             'IN/TRIG) is not supported; IN/TRIG is unconnected')
        old = self.regs[MODE]
        if self.process in ('diagnostics', 'calibration') and value != old:
            raise ValueError(f'drv2605l: MODE write 0x{value:02x} while {self.process} is running (GO high)')
        if self.process == 'sequence' and (value & STANDBY or mode != MODE_INTERNAL_TRIGGER):
            # STANDBY stops playback at once; leaving mode 0 cancels the sequence.
            self._stop()
        self.regs[MODE] = value
        self._check_rtp()

    def _write_go(self, value: int) -> None:
        if value == 0:
            if self.process in ('diagnostics', 'calibration'):
                raise ValueError(f'drv2605l: clearing GO during {self.process} is not modeled')
            # Clearing GO cancels the waveform sequence.
            self._stop()
            return
        if self.regs[GO]:
            return
        mode = self.regs[MODE] & 7
        if self.regs[MODE] & STANDBY:
            raise ValueError('drv2605l: GO written while in standby (MODE bit 6); clear STANDBY first')
        if mode == MODE_RTP:
            raise ValueError('drv2605l: GO in RTP mode (MODE 5) is not modeled')
        now = self.now_ns()
        self.regs[GO] = 1
        if mode == MODE_INTERNAL_TRIGGER:
            self.process = 'sequence'
            self.slot = 0
            self._play_slot(now)
        elif mode == MODE_DIAGNOSTICS:
            self._check_erm('diagnostics')
            self.process = 'diagnostics'
            self._schedule(now + DIAGNOSTICS_MS * MS_NS)
        elif mode == MODE_AUTO_CALIBRATION:
            self._check_erm('auto-calibration')
            self.process = 'calibration'
            self._schedule(now + AUTO_CAL_MS[(self.regs[CONTROL4] >> 4) & 3] * MS_NS)
        else:
            raise ValueError(f'drv2605l: GO in MODE {mode}')

    # ── Playback ──────────────────────────────────────────────────────────────

    def _check_erm(self, what: str) -> None:
        if self.regs[FEEDBACK] & N_ERM_LRA:
            raise ValueError(f'drv2605l: {what} in LRA mode (0x1A bit 7); the motor is an ERM')

    def _check_open_loop(self, what: str) -> None:
        self._check_erm(what)
        if not self.regs[CONTROL3] & ERM_OPEN_LOOP:
            raise ValueError(f'drv2605l: {what} in ERM closed-loop mode (0x1D bit 5 clear) is not modeled')
        if not self.regs[CONTROL2] & BIDIR_INPUT:
            raise ValueError(f'drv2605l: {what} with unidirectional input (0x1C bit 7 clear) is not modeled')

    def _check_rtp(self) -> None:
        if self._rtp_active():
            self._check_open_loop('RTP playback')

    def _rtp_active(self) -> bool:
        return self.regs[MODE] & 7 == MODE_RTP and not self.regs[MODE] & STANDBY

    def _play_slot(self, at_ns: int) -> None:
        """Run sequencer slot `self.slot` from `at_ns`, or end the sequence."""
        if self.slot == len(SEQUENCE):
            self._stop()
            return
        entry = self.regs[SEQUENCE[self.slot]]
        if entry == 0:
            self._stop()
            return
        if entry & WAIT:
            self.effect_playing = False
            self._schedule(at_ns + (entry & 0x7F) * WAIT_STEP_MS * MS_NS)
            return
        self._schedule(at_ns + self._start_effect(entry, at_ns) * MS_NS)

    def _start_effect(self, effect: int, at_ns: int) -> int:
        """Start ROM effect `effect` at `at_ns`; returns its duration in ms."""
        self._check_open_loop(f'effect {effect}')
        if effect > LAST_EFFECT_ID:
            raise ValueError(f'drv2605l: effect {effect} is outside the ROM library (1-123)')
        library = self.regs[LIBRARY] & 7
        if library not in EFFECT_MS:
            raise ValueError(f'drv2605l: effect {effect} from library {library} is not modeled '
                             '(ERM libraries A-D and F are)')
        if any(self.regs[reg] for reg in TIME_OFFSETS):
            raise ValueError('drv2605l: nonzero library time offsets (0x0D-0x10) are not modeled')
        if self.regs[CONTROL5] & PLAYBACK_INTERVAL:
            raise ValueError('drv2605l: the 1 ms playback interval (0x1F bit 4) is not modeled')
        if self.origin_ns is None:
            raise RuntimeError('drv2605l: an effect started before the host gave the time origin')
        self.effect_playing = True
        self.effect_count += 1
        self.last_effect = effect
        self.last_effect_ms = (at_ns - self.origin_ns) / MS_NS
        self.effects.append(effect)
        return EFFECT_MS[library]

    def _schedule(self, due_ns: int) -> None:
        self.due_ns = due_ns
        self.on_playback_scheduled(due_ns)

    def _stop(self) -> None:
        self.process = None
        self.due_ns = None
        self.effect_playing = False
        self.regs[GO] = 0

    def tick(self, now_ns: int) -> None:
        """Run the sequencer steps and process ends due by `now_ns`, each at its own deadline."""
        while self.due_ns is not None and self.due_ns <= now_ns:
            due, self.due_ns = self.due_ns, None
            if self.process == 'sequence':
                self.slot += 1
                self._play_slot(due)
            elif self.process in ('diagnostics', 'calibration'):
                self._stop()
                # Pass: the motor is connected (diagnostics) and calibration converges.
                self.regs[STATUS] = DEVICE_ID
            else:
                raise RuntimeError(f'drv2605l: a deadline with no process running ({self.process!r})')
        self._report()

    # ── Observables ───────────────────────────────────────────────────────────

    def _drive(self) -> int:
        """The RTP drive level, -128..127 (0 = no drive)."""
        if not self._rtp_active():
            return 0
        value = self.regs[RTP_INPUT]
        if self.regs[CONTROL3] & DATA_FORMAT_RTP:
            return value - 128
        return value - 256 if value & 0x80 else value

    def _report(self) -> None:
        drive = self._drive()
        state = {
            'standby': bool(self.regs[MODE] & STANDBY),
            'mode': self.regs[MODE] & 7,
            'library': self.regs[LIBRARY] & 7,
            'go': bool(self.regs[GO]),
            'drive': drive,
            'vibrating': self.effect_playing or drive != 0 or self.process in ('diagnostics', 'calibration'),
            'effectCount': self.effect_count,
            'lastEffect': self.last_effect,
            'lastEffectMs': self.last_effect_ms,
            'effects': ' '.join(str(effect) for effect in self.effects),
        }
        changed = {key: value for key, value in state.items()
                   if key not in self.reported or self.reported[key] != value}
        if changed:
            self.reported.update(changed)
            self.on_state(changed)
