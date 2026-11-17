"""A part's UART on plain GPIOs, for a host with no hardware UART on its pins
(the Uno, where the firmware runs a software UART such as SoftwareSerial).
The part drives its frames on its TX GPIO, and samples the firmware's frames
on its RX GPIO at bit centers from each falling start edge; both at the part's
own framing (embedgym_parts/uart.py), on the host clock."""
from __future__ import annotations

from typing import Callable, Optional

from embedgym_parts.uart import frame_bits


class PinUart:
    """`framing()` is the part's framing now. On RX, `on_start()` runs at each
    start edge and `on_frame(bits, framing)` right after that frame's last
    sample, with the framing in force at its edge. A frame starts only from a
    HIGH the firmware drove, so a line released to an input waits for the next
    HIGH."""

    def __init__(self, part: str, host, tx_gpio: Optional[int], rx_gpio: Optional[int],
                 framing: Callable[[], dict], on_start: Callable[[], None],
                 on_frame: Callable[[list, dict], None]) -> None:
        self.part = part
        self.host = host
        self.rx_gpio = rx_gpio
        self.framing = framing
        self.on_start = on_start
        self.on_frame = on_frame
        self.stops: list = []
        self.output = None
        self.sending = None     # (start_ns, bits, bit_ns, next index)
        self.receiving = None   # (start_ns, framing, bit_ns, samples)
        self.high = False
        if tx_gpio is not None:
            self.output = host.output(tx_gpio, True)
            self.tx_timer = host.timer(self._next_bit)
            self.stops += [self.output.stop, self.tx_timer.stop]
        if rx_gpio is not None:
            self.rx_timer = host.timer(self._sample)
            self.stops += [self.rx_timer.stop, host.watch([rx_gpio], self._rx_changed)]
            self.high = host.mcu_pin(rx_gpio)[0] is True

    def send(self, bits: list, bit_ns: float) -> None:
        """Drive one frame from now; the part paces its frames, so none is on the wire."""
        if self.sending is not None:
            raise RuntimeError(f'{self.part}: a UART frame is already on TX')
        self.sending = (self.host.now_ns(), bits, bit_ns, 0)
        self._next_bit(self.host.now_ns())

    def cancel(self) -> None:
        """Abandon the frame on TX, returning the line to idle HIGH."""
        if self.sending is None:
            return
        self.sending = None
        self.tx_timer.stop()
        self.output.drive(True, self.host.now_ns())

    def stop(self) -> None:
        for stop in self.stops:
            stop()

    def _next_bit(self, now_ns: int) -> None:
        start, bits, bit_ns, index = self.sending
        self.output.drive(bits[index], now_ns)
        index += 1
        if index == len(bits):
            self.sending = None
            return
        self.sending = (start, bits, bit_ns, index)
        self.tx_timer.arm(start + round(index * bit_ns))

    def _rx_changed(self) -> None:
        high = self.host.mcu_pin(self.rx_gpio)[0]
        falling = self.high and high is False
        self.high = high is True
        if not falling or self.receiving is not None:
            return
        framing = dict(self.framing())
        bit_ns = 1e9 / framing['baud']
        start = self.host.now_ns()
        self.receiving = (start, framing, bit_ns, [])
        self.on_start()
        self.rx_timer.arm(start + round(0.5 * bit_ns))

    def _sample(self, now_ns: int) -> None:
        start, framing, bit_ns, samples = self.receiving
        level = self.host.mcu_pin(self.rx_gpio)[0]
        if level is None:
            raise ValueError(f'{self.part}: the firmware stopped driving its UART TX (GPIO {self.rx_gpio}) mid-frame')
        samples.append(level)
        if len(samples) < frame_bits(framing):
            self.rx_timer.arm(start + round((len(samples) + 0.5) * bit_ns))
            return
        self.receiving = None
        self.on_frame(samples, framing)
