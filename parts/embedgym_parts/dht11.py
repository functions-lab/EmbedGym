"""DHT11 temperature + humidity sensor on one pulled-up DATA line.

The host (embedgym_parts/registry.py's `line`) feeds every transition of the wired
level to `on_line`, stamped in virtual ns, and lands each reply edge asked for
through `drive(low, at_ns)` on its clock.
"""
from __future__ import annotations

from typing import Callable

DHT11_START_MIN_NS = 18_000_000
DHT11_RESPONSE_DELAY_NS = 20_000
DHT11_RESPONSE_LOW_NS = 80_000
DHT11_RESPONSE_HIGH_NS = 80_000
DHT11_BIT_LOW_NS = 50_000
DHT11_BIT0_HIGH_NS = 28_000
DHT11_BIT1_HIGH_NS = 70_000


class Dht11Slave:
    """A LOW held for `start_min_ns` and then released is the start signal.
    20 µs later the part answers 80 µs LOW, 80 µs HIGH, then 40 bits MSB first
    (50 µs LOW, then 28 µs HIGH for a 0 or 70 µs for a 1) and a closing 50 µs
    LOW. The frame [RH int, RH tenths, T int, T tenths, checksum] comes from
    the reading at the start signal. Line activity until 20 µs after the frame
    is ignored. The 1 s settle time is not modeled."""

    def __init__(self, get_reading: Callable[[], tuple[float, float]],
                 drive: Callable[[bool, int], None],
                 start_min_ns: int = DHT11_START_MIN_NS) -> None:
        self._get_reading = get_reading  # () -> (temperature C, humidity %)
        self._drive = drive
        self._start_min_ns = start_min_ns
        self._line_low = False
        self._fall_ns = 0
        self._busy_until = 0

    @staticmethod
    def frame(temperature: float, humidity: float) -> list[int]:
        data = [*divmod(round(humidity * 10), 10), *divmod(round(temperature * 10), 10)]
        return data + [sum(data) & 0xFF]

    def on_line(self, high: bool, now_ns: int) -> None:
        if now_ns < self._busy_until:
            return
        if not high:
            if not self._line_low:
                self._line_low = True
                self._fall_ns = now_ns
            return
        if not self._line_low:
            return
        self._line_low = False
        if now_ns - self._fall_ns >= self._start_min_ns:
            self._respond(now_ns)

    def _respond(self, released_ns: int) -> None:
        t = released_ns + DHT11_RESPONSE_DELAY_NS
        self._drive(True, t)
        t += DHT11_RESPONSE_LOW_NS
        self._drive(False, t)
        t += DHT11_RESPONSE_HIGH_NS
        for byte in self.frame(*self._get_reading()):
            for bit in range(7, -1, -1):
                self._drive(True, t)
                t += DHT11_BIT_LOW_NS
                self._drive(False, t)
                t += DHT11_BIT1_HIGH_NS if (byte >> bit) & 1 else DHT11_BIT0_HIGH_NS
        self._drive(True, t)
        t += DHT11_BIT_LOW_NS
        self._drive(False, t)
        self._busy_until = t + DHT11_RESPONSE_DELAY_NS
