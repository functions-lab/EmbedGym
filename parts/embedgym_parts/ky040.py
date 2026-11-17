"""KY-040 rotary encoder.

CLK and DT idle HIGH; SW is active LOW, and with SW unwired a press reaches no pin.
The host (embedgym_parts/registry.py's `output`) lands each level asked for through
a pin's `drive(high, at_ns)` on its clock.
"""
from __future__ import annotations

from typing import Callable, Optional

# A 20-detent EC11-class encoder turned at its rated 360°/s (60 RPM) spends
# 50 ms per detent, four edges.
KY040_PHASE_NS = 12_500_000

Drive = Callable[[bool, int], None]


class KY040:
    """A detent is a full quadrature cycle: the leading pin (CLK clockwise, DT
    counter-clockwise) falls, the other one phase later, and both rise in the
    same order, so decoders on either CLK edge read the direction. A step asked
    for while a detent is still turning starts when that detent ends."""

    def __init__(self, clk: Drive, dt: Drive, sw: Optional[Drive]) -> None:
        self._clk = clk
        self._dt = dt
        self._sw = sw
        self._turning_until_ns = 0

    def step(self, direction: str, now_ns: int) -> None:
        if direction == 'cw':
            lead, lag = self._clk, self._dt
        elif direction == 'ccw':
            lead, lag = self._dt, self._clk
        else:
            raise ValueError(f"ky-040: step is 'cw' or 'ccw', got {direction!r}")
        start = max(now_ns, self._turning_until_ns)
        self._turning_until_ns = start + 4 * KY040_PHASE_NS
        lead(False, start)
        lag(False, start + KY040_PHASE_NS)
        lead(True, start + 2 * KY040_PHASE_NS)
        lag(True, start + 3 * KY040_PHASE_NS)

    def press(self, pressed: bool, now_ns: int) -> None:
        if self._sw is not None:
            self._sw(not pressed, now_ns)
