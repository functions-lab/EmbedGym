"""The GPIO level changes a backend worker reports to the browser."""
from __future__ import annotations

from typing import Callable, Iterable, Optional


class GpioReports:
    """A worker follows every GPIO, but reports a level change as a
    `gpio_change` event only on a pin the browser watches: the config's
    `watched_pins`, then each `watch_pins` command's. A busy firmware toggles
    pins nothing in the browser reads millions of times per simulated second.

    A pin the browser starts watching is reported at the level it last changed
    to, without `t_ns`: the change happened earlier, unwatched. A pin that never
    changed has no level to report.
    """

    def __init__(self, emit: Callable[[dict], None], watched: Iterable[int],
                 now_ns: Optional[Callable[[], int]] = None) -> None:
        self._emit = emit
        self._now_ns = now_ns
        self._watched = _pin_set(watched)
        self._levels: dict[int, int] = {}

    def changed(self, gpio: int, level: int) -> None:
        self._levels[gpio] = level
        if gpio in self._watched:
            event = {'type': 'gpio_change', 'pin': gpio, 'state': level}
            if self._now_ns is not None:
                event['t_ns'] = self._now_ns()
            self._emit(event)

    def watch(self, gpios: Iterable[int]) -> None:
        watched = _pin_set(gpios)
        for gpio in sorted(watched - self._watched):
            if gpio in self._levels:
                self._emit({'type': 'gpio_change', 'pin': gpio, 'state': self._levels[gpio]})
        self._watched = watched


def _pin_set(gpios: Iterable[int]) -> frozenset[int]:
    pins = frozenset(gpios)
    for gpio in pins:
        if type(gpio) is not int:
            raise ValueError(f'watched pins must be GPIO numbers, got {gpio!r}')
    return pins
