"""Unit tests for embedgym_parts/i2c/drv2605l.py (DRV2605LSlave) over the picsimlab I2C
event encoding, with the worker's timer contract and state reports."""
from __future__ import annotations

import pytest

from embedgym_parts.i2c.drv2605l import DRV2605LSlave, RESET_VALUES
from i2c_bus import MS_NS, read_regs, write_regs


class Harness:
    """A virtual clock, the one timer the slave arms and the element state it reports."""

    def __init__(self, origin_ms: float = 0) -> None:
        self.now = 0
        self.due: int | None = None
        self.state: dict = {}
        self.dev = DRV2605LSlave(lambda: self.now)
        self.dev.on_playback_scheduled = self._schedule
        self.dev.on_state = self.state.update
        self.dev.set_time_origin(round(origin_ms * MS_NS))
        self.dev.power_on()

    def _schedule(self, due_ns: int) -> None:
        assert due_ns >= self.now
        self.due = due_ns

    def advance(self, ms: float) -> None:
        target = self.now + round(ms * MS_NS)
        while self.due is not None and self.due <= target:
            self.now = self.due
            self.due = None
            self.dev.tick(self.now)
        self.now = target

    def write(self, reg: int, *values: int) -> None:
        write_regs(self.dev, reg, *values)

    def read(self, reg: int, count: int = 1) -> list[int]:
        return read_regs(self.dev, reg, count)

    def go_clears_after(self, step_ms: float = 1) -> float:
        """Poll GO every `step_ms` as the golds do; the elapsed ms when it reads 0."""
        start = self.now
        while self.read(0x0C) == [1]:
            self.advance(step_ms)
        return (self.now - start) / MS_NS


def ready(h: Harness) -> None:
    """The golds' init: out of standby in mode 0, library A, ERM open loop."""
    h.write(0x01, 0x00)
    h.write(0x03, 0x01)
    h.write(0x1A, 0x00)
    h.write(0x1D, 0x20)


def test_reset_values_follow_the_field_tables():
    h = Harness()
    regs = h.read(0x00, 0x21)
    assert regs == [RESET_VALUES[reg] for reg in range(0x21)]
    assert regs[0x00] == 0xE0 and regs[0x01] == 0x40 and regs[0x03] == 0x01
    assert regs[0x04] == 0x00 and regs[0x17] == 0x8C and regs[0x19] == 0x6F and regs[0x20] == 0x00
    assert regs[0x1A:0x20] == [0x36, 0x93, 0xF5, 0xA0, 0x20, 0x80]
    assert h.state == {'standby': True, 'mode': 0, 'library': 1, 'go': False, 'drive': 0, 'vibrating': False,
                       'effectCount': 0, 'lastEffect': 0, 'lastEffectMs': -1.0, 'effects': ''}


def test_pointer_auto_increments_and_reserved_bits_read_zero():
    h = Harness()
    h.write(0x04, 1, 2, 3)
    assert h.read(0x04, 4) == [1, 2, 3, 0]
    h.write(0x01, 0x38 | 0x05)
    assert h.read(0x01) == [0x05]
    h.write(0x0C, 0xFE)
    assert h.read(0x0C) == [0]


def test_one_effect_plays_for_the_library_a_estimate_and_go_self_clears():
    h = Harness(origin_ms=2)
    ready(h)
    h.write(0x04, 1, 0)
    h.advance(250)
    h.write(0x0C, 1)
    assert h.state['go'] and h.state['vibrating']
    assert h.go_clears_after() == 100
    assert h.state == {**h.state, 'go': False, 'vibrating': False, 'effectCount': 1, 'lastEffect': 1,
                       'lastEffectMs': 248.0, 'effects': '1'}


def test_sequence_with_wait_plays_each_slot_in_turn():
    h = Harness()
    ready(h)
    h.write(0x04, 10, 0x80 | 20, 47, 0, 0, 0, 0, 0)
    h.write(0x0C, 1)
    h.advance(100)
    assert h.state['effects'] == '10'
    assert h.state['lastEffect'] == 10 and not h.state['vibrating']
    h.advance(199.999)
    assert h.state['effectCount'] == 1
    h.advance(0.001)
    assert h.state['effects'] == '10 47' and h.state['lastEffectMs'] == 300.0 and h.state['vibrating']
    h.advance(99.999)
    assert h.read(0x0C) == [1]
    h.advance(0.001)
    assert h.read(0x0C) == [0] and not h.state['vibrating']


def test_all_eight_slots_play_then_go_clears():
    h = Harness()
    ready(h)
    h.write(0x04, *range(1, 9))
    h.write(0x0C, 1)
    assert h.go_clears_after() == 800
    assert h.state['effects'] == '1 2 3 4 5 6 7 8'


def test_slots_are_read_as_the_sequencer_reaches_them_and_go_repeats():
    h = Harness()
    ready(h)
    h.write(0x04, 1, 0)
    h.write(0x0C, 1)
    h.write(0x05, 2)
    h.write(0x0C, 1)
    assert h.go_clears_after() == 200
    h.write(0x0C, 1)
    h.advance(200)
    assert h.state['effects'] == '1 2 1 2' and h.state['effectCount'] == 4


def test_clearing_go_cancels_and_standby_stops_playback():
    h = Harness()
    ready(h)
    h.write(0x04, 1, 2, 0)
    h.write(0x0C, 1)
    h.advance(50)
    h.write(0x0C, 0)
    assert h.state['go'] is False and h.state['vibrating'] is False
    h.advance(500)
    assert h.state['effects'] == '1'
    h.write(0x0C, 1)
    h.advance(150)
    h.write(0x01, 0x40)
    assert h.read(0x0C) == [0] and h.state['standby'] and not h.state['vibrating']
    assert h.state['effects'] == '1 1 2'
    with pytest.raises(ValueError, match='standby'):
        h.write(0x0C, 1)


def test_empty_first_slot_ends_at_once():
    h = Harness()
    ready(h)
    h.write(0x04, 0)
    h.write(0x0C, 1)
    assert h.read(0x0C) == [0] and h.state['effectCount'] == 0


@pytest.mark.parametrize('library, ms', [(2, 75), (3, 100), (4, 165), (7, 65)])
def test_other_erm_libraries_use_their_own_estimate(library, ms):
    h = Harness()
    ready(h)
    h.write(0x03, library)
    h.write(0x04, 1, 0)
    h.write(0x0C, 1)
    assert h.go_clears_after() == ms
    assert h.state['library'] == library


def test_rtp_signed_and_unsigned():
    h = Harness()
    h.write(0x01, 0x00)
    h.write(0x02, 0x7F)
    assert h.state['drive'] == 0
    h.write(0x01, 0x05)
    assert h.state['mode'] == 5 and h.state['drive'] == 127 and h.state['vibrating']
    assert h.read(0x0C) == [0]
    h.write(0x02, 0x81)
    assert h.state['drive'] == -127
    h.write(0x1D, 0xA0 | 0x08)
    assert h.state['drive'] == 1
    for value, drive in ((128, 0), (255, 127), (0, -128)):
        h.write(0x02, value)
        assert h.state['drive'] == drive
    h.write(0x02, 200)
    h.write(0x01, 0x45)
    assert h.state['drive'] == 0 and not h.state['vibrating']
    h.write(0x01, 0x05)
    assert h.state['drive'] == 72
    h.write(0x01, 0x00)
    assert h.state['drive'] == 0 and h.state['effectCount'] == 0


def test_dev_reset_restores_defaults_and_stops_playback():
    h = Harness()
    ready(h)
    h.write(0x04, 1, 0)
    h.write(0x0C, 1)
    h.write(0x01, 0x80)
    assert h.read(0x01) == [0x40]
    assert h.read(0x00, 0x21) == [RESET_VALUES[reg] for reg in range(0x21)]
    assert h.state['standby'] and not h.state['go'] and h.state['effects'] == '1'
    h.advance(1000)
    assert h.state['effectCount'] == 1


def test_diagnostics_and_auto_calibration_self_clear_go():
    h = Harness()
    h.write(0x01, 0x06)
    h.write(0x0C, 1)
    assert h.state['go']
    h.advance(99)
    assert h.read(0x0C) == [1]
    h.advance(1)
    assert h.read(0x0C) == [0]
    assert h.read(0x00) == [0xE0]
    h.write(0x01, 0x07)
    h.write(0x1E, 0x30)
    h.write(0x0C, 1)
    with pytest.raises(ValueError, match='while calibration'):
        h.write(0x01, 0x00)
    assert h.go_clears_after(10) == 1200
    assert h.read(0x18, 3) == [0x0C, 0x6F, 0x36]
    assert h.state['effectCount'] == 0


@pytest.mark.parametrize('mode', [1, 2, 3, 4])
def test_trigger_and_input_pin_modes_are_rejected(mode):
    h = Harness()
    with pytest.raises(ValueError, match=f'MODE {mode}'):
        h.write(0x01, mode)


@pytest.mark.parametrize('setup, message', [
    (lambda h: h.write(0x1A, 0x80), 'LRA mode'),
    (lambda h: h.write(0x1D, 0x00), 'closed-loop'),
    (lambda h: h.write(0x1C, 0x75), 'unidirectional'),
    (lambda h: h.write(0x03, 0x05), 'library 5'),
    (lambda h: h.write(0x03, 0x00), 'library 0'),
    (lambda h: h.write(0x0D, 0x05), 'time offsets'),
    (lambda h: h.write(0x1F, 0x90), 'playback interval'),
    (lambda h: h.write(0x04, 124, 0), 'outside the ROM'),
])
def test_unsupported_playback_is_rejected_at_go(setup, message):
    h = Harness()
    ready(h)
    h.write(0x04, 1, 0)
    setup(h)
    with pytest.raises(ValueError, match=message):
        h.write(0x0C, 1)


@pytest.mark.parametrize('reg, value, message', [
    (0x00, 0x00, 'read-only'),
    (0x03, 0x11, 'HI_Z'),
    (0x1E, 0x21, 'OTP'),
    (0x21, 0x00, 'VBAT'),
    (0x23, 0x00, 'ends at 0x22'),
])
def test_unsupported_writes_are_rejected(reg, value, message):
    h = Harness()
    with pytest.raises(ValueError, match=message):
        h.write(reg, value)


def test_rtp_outside_open_loop_erm_is_rejected():
    h = Harness()
    h.write(0x1D, 0x80)
    with pytest.raises(ValueError, match='RTP playback in ERM closed-loop'):
        h.write(0x01, 0x05)
    h = Harness()
    h.write(0x01, 0x05)
    with pytest.raises(ValueError, match='RTP playback in LRA'):
        h.write(0x1A, 0xB6)


def test_go_in_rtp_mode_is_rejected():
    h = Harness()
    h.write(0x01, 0x05)
    with pytest.raises(ValueError, match='GO in RTP'):
        h.write(0x0C, 1)


def test_vbat_and_lra_period_reads_are_rejected():
    h = Harness()
    for reg in (0x21, 0x22):
        with pytest.raises(ValueError, match='not modeled'):
            h.read(reg)
