"""Unit tests for embedgym_parts/hc_sr04.py (HcSr04)."""
from __future__ import annotations

import pytest

from embedgym_parts.hc_sr04 import HcSr04


def test_hcsr04_echo_follows_the_falling_trig_edge():
    edges = []
    sonar = HcSr04(lambda high, at: edges.append((high, at)), 100)
    sonar.on_trig(True, 1_000)
    assert edges == []
    sonar.on_trig(False, 11_000)
    width = round(100 / 17150 * 1e9)
    assert edges == [(True, 611_000), (False, 611_000 + width)]


def test_hcsr04_ignores_a_trig_pulse_shorter_than_9_us():
    edges = []
    sonar = HcSr04(lambda high, at: edges.append((high, at)), 10)
    sonar.on_trig(True, 0)
    sonar.on_trig(False, 8_999)
    assert edges == []
    sonar.on_trig(True, 20_000)
    sonar.on_trig(False, 30_000)
    assert [high for high, _ in edges] == [True, False]


def test_hcsr04_times_the_pulse_from_its_first_rising_edge():
    edges = []
    sonar = HcSr04(lambda high, at: edges.append((high, at)), 10)
    sonar.on_trig(False, 0)
    sonar.on_trig(True, 1_000)
    sonar.on_trig(True, 6_000)
    sonar.on_trig(False, 11_000)
    assert edges[0] == (True, 611_000)
    sonar.on_trig(False, 12_000)
    assert len(edges) == 2


def test_hcsr04_ignores_a_trigger_during_its_cycle():
    edges = []
    sonar = HcSr04(lambda high, at: edges.append((high, at)), 10)
    sonar.on_trig(True, 0)
    sonar.on_trig(False, 10_000)
    sonar.on_trig(True, 20_000)
    sonar.on_trig(False, 30_000)
    assert len(edges) == 2
    end = edges[-1][1]
    sonar.on_trig(True, end)
    sonar.on_trig(False, end + 10_000)
    assert len(edges) == 4


def test_hcsr04_rejects_a_distance_out_of_range():
    with pytest.raises(ValueError):
        HcSr04(lambda high, at: None, 1)
    sonar = HcSr04(lambda high, at: None, 10)
    with pytest.raises(ValueError):
        sonar.set_distance(401)
