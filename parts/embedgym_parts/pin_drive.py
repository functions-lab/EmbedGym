"""A worker model's own pins, driven on the canvas through the frontend part."""
from __future__ import annotations

from typing import Callable, Optional


def pin_drive_emitter(sensor_pin: int, emit, now_ns=None) -> Callable[[str, Optional[dict]], None]:
    """The canvas route of a model's drive on one of its pins.

    `drive` is the frontend's PinDrive, `{'voltage': V, 'resistance': ohms}`,
    or None for Hi-Z. The model drives on the virtual clock (an I2C transfer
    or one of its timers); each change becomes one `part_pin_drive` event for
    the part registered at `sensor_pin`, stamped with `now_ns()` when the
    worker passes a clock.
    """
    last: dict[str, dict | None] = {}

    def on_pin_drive(part_pin: str, drive: dict | None) -> None:
        drive = None if drive is None else dict(drive)
        if part_pin in last and last[part_pin] == drive:
            return
        last[part_pin] = drive
        event = {'type': 'part_pin_drive', 'pin': sensor_pin, 'part_pin': part_pin, 'drive': drive}
        if now_ns is not None:
            event['t_ns'] = now_ns()
        emit(event)

    return on_pin_drive
