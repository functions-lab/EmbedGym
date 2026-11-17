"""HC-SR04 ultrasonic ranger.

The host (embedgym_parts/registry.py's `edges` and `output`) feeds every TRIG level to
`on_trig`, stamped in virtual ns, and lands each ECHO edge asked for through
`drive_echo(high, at_ns)` on its clock.
"""
from __future__ import annotations

from typing import Callable

# The datasheet's 10 µs, less the 1 µs ArduinoCore-zephyr's delayMicroseconds
# leaves to call overhead: its delayMicroseconds(10) pulse is ~9.9 µs.
HCSR04_TRIG_MIN_NS = 9_000
HCSR04_ECHO_DELAY_NS = 600_000
HCSR04_ROUND_TRIP_CM_PER_S = 17150  # half the speed of sound: 58.3 µs of ECHO per cm
HCSR04_RANGE_CM = (2, 400)


class HcSr04:
    """A TRIG HIGH pulse of at least 9 µs starts a measurement on its falling
    edge: ECHO rises 600 µs later and stays HIGH for the round trip to
    `distance`. A shorter pulse is ignored, and so is one that ends before the
    previous echo has ended, as the module runs one cycle at a time."""

    def __init__(self, drive_echo: Callable[[bool, int], None], distance_cm: float) -> None:
        self._drive_echo = drive_echo
        self._trig_rise_ns: int | None = None
        self._busy_until = 0
        self.set_distance(distance_cm)

    def set_distance(self, cm: float) -> None:
        low, high = HCSR04_RANGE_CM
        if not low <= cm <= high:
            raise ValueError(f'hc-sr04: distance {cm} cm is outside {low}..{high}')
        self.echo_ns = round(cm / HCSR04_ROUND_TRIP_CM_PER_S * 1e9)

    def on_trig(self, high: bool, now_ns: int) -> None:
        if high:
            if self._trig_rise_ns is None:
                self._trig_rise_ns = now_ns
            return
        rise_ns = self._trig_rise_ns
        self._trig_rise_ns = None
        if rise_ns is None or now_ns - rise_ns < HCSR04_TRIG_MIN_NS or now_ns < self._busy_until:
            return
        echo_rise_ns = now_ns + HCSR04_ECHO_DELAY_NS
        self._busy_until = echo_rise_ns + self.echo_ns
        self._drive_echo(True, echo_rise_ns)
        self._drive_echo(False, self._busy_until)
