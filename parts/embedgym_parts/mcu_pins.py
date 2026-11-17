"""A part's own pins on a backend host's 3.3 V MCU (esp32_worker.py,
nrf52_worker.py).

The frontend part resolves the canvas at attach: per pin its rail loads
(`load`, a PinDrive or None), whether other canvas parts share its net
(`parts`) and, for a pin wired to an MCU GPIO, the series resistance to it
(`series`). A pin on a GPIO is resolved here: while the firmware holds the
GPIO as an input it reads the level of the part's drive and loads, and the
part sees the firmware's output through the series resistor. Every other
pin's drive reaches the canvas through the frontend part
(embedgym_parts/pin_drive.py).
"""
from __future__ import annotations

from typing import Callable, Optional

from embedgym_parts.i2c.mpr121 import GPIO_PINS, HIGH_MIN, LOW_MAX

VDD = 3.3
MCU_OUTPUT_OHMS = 25


def resolve_voltage(drives) -> float | None:
    """resolvePinVoltage in PhysicalPinDrives.ts: the node voltage of parallel
    Thevenin sources, None when nothing drives the node."""
    current = 0.0
    conductance = 0.0
    for drive in drives:
        if drive is None:
            continue
        current += drive['voltage'] / drive['resistance']
        conductance += 1 / drive['resistance']
    return None if conductance == 0 else current / conductance


class McuPins:
    """The MPR121's INT and electrodes 4–11 (`int_pin`, `e<N>_pin` and
    `electrodes` in its fields) for `model.on_pin_drive`, `model.pin_voltage`
    and `model.pins_changed`. INT on a GPIO idles HIGH on the breakout's
    pull-up and reads LOW while the part asserts it."""

    def __init__(self, model, fields: dict, host, canvas: Callable[[str, Optional[dict]], None]) -> None:
        electrodes = fields.get('electrodes')
        if not isinstance(electrodes, dict) or set(electrodes) != set(GPIO_PINS):
            raise ValueError(f'mpr121: electrodes must describe {list(GPIO_PINS)}')
        for pin, net in electrodes.items():
            bound = fields.get(f'e{pin}_pin') is not None
            if bound != (net.get('series') is not None) or (bound and net.get('parts')):
                raise ValueError(f'mpr121: electrode {pin} net does not match its GPIO')
        self.model = model
        self.host = host
        self.canvas = canvas
        self.nets = electrodes
        self.gpios = {pin: int(fields[f'e{pin}_pin']) for pin in GPIO_PINS if fields.get(f'e{pin}_pin') is not None}
        self.int_gpio = None if fields.get('int_pin') is None else int(fields['int_pin'])
        self.own: dict = {}
        self.levels: dict = {}
        model.on_pin_drive = self._drive
        model.pin_voltage = self._voltage
        self.unwatch = host.watch(list(self.gpios.values()), self._changed)

    def _output(self, pin: str) -> Optional[bool]:
        return self.host.mcu_pin(self.gpios[pin])[0]

    def _drive(self, pin: str, drive: Optional[dict]) -> None:
        if pin == 'INT' and self.int_gpio is not None:
            self.host.set_level(self.int_gpio, drive is None)
        elif pin in self.gpios:
            self.own[pin] = drive
            self._push_level(pin)
        else:
            self.canvas(pin, drive)

    def _push_level(self, pin: str) -> None:
        """The level the firmware reads on the electrode's GPIO, sent while the
        firmware holds it as an input; floating and indeterminate voltages
        leave the last level, as on the AVR."""
        if self._output(pin) is not None:
            self.levels.pop(pin, None)
            return
        voltage = resolve_voltage((self.own.get(pin), self.nets[pin]['load']))
        if voltage is None or LOW_MAX < voltage < HIGH_MIN:
            return
        high = voltage >= HIGH_MIN
        if self.levels.get(pin) != high:
            self.levels[pin] = high
            self.host.set_level(self.gpios[pin], high)

    def _voltage(self, pin: str) -> Optional[float]:
        net = self.nets[pin]
        sources = [self.own.get(pin), net['load']]
        if pin in self.gpios:
            level = self._output(pin)
            if level is not None:
                sources.append({'voltage': VDD if level else 0, 'resistance': MCU_OUTPUT_OHMS + net['series']})
        elif net['parts']:
            raise ValueError(f'mpr121: GPIO electrode {pin} input from other canvas parts is not modeled on this board')
        return resolve_voltage(sources)

    def _changed(self) -> None:
        for pin in self.gpios:
            self._push_level(pin)
        self.model.pins_changed()
