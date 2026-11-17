"""Unit tests for embedgym_parts/dht11.py (Dht11Slave)."""
from __future__ import annotations

from embedgym_parts.dht11 import Dht11Slave


def decode_dht11(edges: list[tuple[bool, int]]) -> list[int]:
    """Bytes from the part's (low, at_ns) drives: each bit's HIGH width after its 50 µs LOW."""
    lows = [at for low, at in edges if low]
    highs = [at for low, at in edges if not low]
    # Skip the 80 µs response pair; the last LOW is the closing one.
    widths = [lows[i + 1] - highs[i] for i in range(1, len(lows) - 1)]
    bits = [1 if w > 50_000 else 0 for w in widths]
    return [int(''.join(map(str, bits[i:i + 8])), 2) for i in range(0, 40, 8)]


def test_dht11_answers_a_start_signal_with_the_reading():
    edges = []
    dev = Dht11Slave(lambda: (23.4, 56.7), lambda low, at: edges.append((low, at)))
    dev.on_line(False, 1_000)
    dev.on_line(True, 1_000 + 18_000_000)
    assert edges[0] == (True, 18_001_000 + 20_000)
    assert len(edges) == 2 + 40 * 2 + 2
    assert decode_dht11(edges) == [56, 7, 23, 4, (56 + 7 + 23 + 4) & 0xFF]


def test_dht11_ignores_a_short_low_and_its_own_reply():
    edges = []
    dev = Dht11Slave(lambda: (20.0, 50.0), lambda low, at: edges.append((low, at)))
    dev.on_line(False, 0)
    dev.on_line(True, 17_000_000)
    assert edges == []
    dev.on_line(False, 20_000_000)
    dev.on_line(True, 40_000_000)
    count = len(edges)
    for low, at in list(edges):
        dev.on_line(not low, at)
    assert len(edges) == count


def test_dht11_start_threshold_is_configurable():
    edges = []
    dev = Dht11Slave(lambda: (20.0, 50.0), lambda low, at: edges.append((low, at)), start_min_ns=17_800_000)
    dev.on_line(False, 0)
    dev.on_line(True, 17_900_000)
    assert edges
