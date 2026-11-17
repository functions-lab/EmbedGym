"""Unit tests for embedgym_parts/ky040.py (KY040)."""
from __future__ import annotations

import pytest

from embedgym_parts.ky040 import KY040, KY040_PHASE_NS as PHASE


def encoder(sw: bool = True):
    edges = []
    pin = lambda name: lambda high, at: edges.append((name, high, at))  # noqa: E731
    return KY040(pin('CLK'), pin('DT'), pin('SW') if sw else None), edges


def test_ky040_clockwise_detent_leads_with_clk_then_ccw_with_dt():
    knob, edges = encoder()
    knob.step('cw', 1_000)
    assert edges == [('CLK', False, 1_000), ('DT', False, 1_000 + PHASE),
                     ('CLK', True, 1_000 + 2 * PHASE), ('DT', True, 1_000 + 3 * PHASE)]
    edges.clear()
    knob.step('ccw', 10 * PHASE)
    assert [(name, high) for name, high, _ in edges] == [('DT', False), ('CLK', False), ('DT', True), ('CLK', True)]


def test_ky040_step_during_a_detent_starts_when_it_ends():
    knob, edges = encoder()
    knob.step('cw', 0)
    knob.step('cw', PHASE)
    assert edges[4] == ('CLK', False, 4 * PHASE)
    with pytest.raises(ValueError, match="step is 'cw' or 'ccw'"):
        knob.step('left', 0)


def test_ky040_button_is_active_low_and_an_unwired_sw_drives_nothing():
    knob, edges = encoder()
    knob.press(True, 5)
    knob.press(False, 9)
    assert edges == [('SW', False, 5), ('SW', True, 9)]
    knob, edges = encoder(sw=False)
    knob.press(True, 0)
    assert edges == []
