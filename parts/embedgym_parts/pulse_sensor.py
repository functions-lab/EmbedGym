"""Sensors whose output idles LOW and goes HIGH for a fixed time when
triggered: the PIR motion sensor and the KY-002-style shock sensor.

The host (embedgym_parts/registry.py's `output`) lands each level asked for through
`drive(high, at_ns)` on its clock.
"""
from __future__ import annotations

from typing import Callable

PIR_HOLD_NS = 3_000_000_000
SHOCK_HOLD_NS = 50_000_000


class PulseSensor:
    """A trigger while the output is HIGH keeps the first deadline."""

    def __init__(self, name: str, drive: Callable[[bool, int], None], hold_ns: int) -> None:
        self.name = name
        self._drive = drive
        self._hold_ns = hold_ns
        self._high_until_ns = 0

    def trigger(self, now_ns: int) -> None:
        if now_ns < self._high_until_ns:
            return
        self._high_until_ns = now_ns + self._hold_ns
        self._drive(True, now_ns)
        self._drive(False, self._high_until_ns)
