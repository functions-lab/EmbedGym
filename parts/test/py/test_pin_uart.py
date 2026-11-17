"""Unit tests for embedgym_parts/pin_uart.py over the registry tests' fake host."""
from __future__ import annotations

import pytest

from embedgym_parts.pa1616s import FRAMING
from embedgym_parts.pin_uart import PinUart
from embedgym_parts.uart import encode
from test_registry import FakeHost

BIT_NS = 1e9 / 9600


def wire(host: FakeHost, frames: list) -> PinUart:
    return PinUart('part', host, 8, 7, lambda: FRAMING, lambda: frames.append(('start', host.now)),
                   lambda bits, framing: frames.append((bits, framing, host.now)))


def test_send_drives_each_bit_one_bit_time_apart_and_cancel_returns_the_line_high():
    host = FakeHost()
    uart = wire(host, [])
    bits = encode('part', 0x55, FRAMING)
    uart.send(bits, BIT_NS)
    with pytest.raises(RuntimeError, match='a UART frame is already on TX'):
        uart.send(bits, BIT_NS)
    host.advance(2)
    assert host.outputs[0].levels[1:] == [(level, round(index * BIT_NS)) for index, level in enumerate(bits)]
    host.now = 3_000_000
    uart.send(bits, BIT_NS)
    host.advance_to(3_000_000 + round(BIT_NS))
    uart.cancel()
    host.advance(2)
    assert host.outputs[0].levels[-3:] == [(False, 3_000_000), (True, 3_000_000 + round(BIT_NS)), (True, 3_000_000 + round(BIT_NS))]


def test_a_frame_starts_at_a_falling_edge_from_a_driven_high_and_samples_bit_centers():
    host = FakeHost()
    frames: list = []
    uart = wire(host, frames)
    host.drive(7, (False, None))
    assert frames == []
    host.drive(7, (True, None))
    bits = encode('part', 0xA3, FRAMING)
    host.send_frame(7, bits, 9600)
    assert frames == [('start', 0), (bits, FRAMING, round(9.5 * BIT_NS))]
    uart.stop()
    assert host.watches == [] and host.timers[0].stopped and host.timers[1].stopped


def test_a_line_released_mid_frame_is_rejected():
    host = FakeHost()
    wire(host, [])
    host.drive(7, (True, None))
    host.drive(7, (False, None))
    host.drive(7, (None, None))
    with pytest.raises(ValueError, match=r'part: the firmware stopped driving its UART TX \(GPIO 7\) mid-frame'):
        host.advance(1)
