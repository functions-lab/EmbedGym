"""UART framings as a host reports them: {'baud': int | None, 'data_bits': 7 | 8,
'parity': 'none' | 'even' | 'odd', 'stop_bits': 1 | 2}; a None baud is one the
host cannot read, and is not checked."""
from __future__ import annotations


def frame_bits(framing: dict) -> int:
    return 1 + framing['data_bits'] + (0 if framing['parity'] == 'none' else 1) + framing['stop_bits']


def same_framing(a: dict, b: dict) -> bool:
    """A 7-data-bit/2-stop frame and an 8-data-bit/1-stop frame have the same bit layout on the wire."""
    baud_ok = a['baud'] is None or b['baud'] is None or abs(a['baud'] - b['baud']) / a['baud'] <= 0.03
    return baud_ok and a['parity'] == b['parity'] and frame_bits(a) == frame_bits(b)


def parity_bit(byte: int, data_bits: int, parity: str) -> bool:
    ones = sum((byte >> bit) & 1 for bit in range(data_bits))
    return ones % 2 == 1 if parity == 'even' else ones % 2 == 0


def encode(part: str, byte: int, framing: dict) -> list[bool]:
    """Line levels of one frame: start bit, data LSB first, optional parity, stop bits."""
    if byte >> framing['data_bits']:
        raise ValueError(f'{part}: byte {byte} does not fit {framing["data_bits"]} UART data bits')
    bits = [False] + [bool(byte & (1 << bit)) for bit in range(framing['data_bits'])]
    if framing['parity'] != 'none':
        bits.append(parity_bit(byte, framing['data_bits'], framing['parity']))
    return bits + [True] * framing['stop_bits']


def decode(part: str, bits: list[bool], framing: dict) -> int:
    byte = 0
    for bit in range(framing['data_bits']):
        if bits[bit + 1]:
            byte |= 1 << bit
    stop = framing['data_bits'] + 1
    if framing['parity'] != 'none':
        if bits[stop] != parity_bit(byte, framing['data_bits'], framing['parity']):
            raise ValueError(f'{part}: UART frame has a parity error; receiver error flags are not modeled')
        stop += 1
    if not all(bits[stop:stop + framing['stop_bits']]):
        raise ValueError(f'{part}: UART frame has a stop-bit (framing) error; receiver error flags are not modeled')
    return byte
