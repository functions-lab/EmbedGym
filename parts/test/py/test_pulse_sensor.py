"""Unit tests for embedgym_parts/pulse_sensor.py (PulseSensor)."""
from __future__ import annotations

from embedgym_parts.pulse_sensor import PulseSensor


def test_pulse_sensor_holds_high_and_keeps_the_first_deadline():
    levels = []
    sensor = PulseSensor('pir-motion-sensor', lambda high, at: levels.append((high, at)), 1_000)
    sensor.trigger(100)
    sensor.trigger(600)
    assert levels == [(True, 100), (False, 1_100)]
    sensor.trigger(1_100)
    assert levels[2:] == [(True, 1_100), (False, 2_100)]
