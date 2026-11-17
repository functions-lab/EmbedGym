"""JS arithmetic the frontend virtual devices are written in."""
import math


def i32(x: int) -> int:
    """JS `| 0`: wrap to a signed 32-bit integer."""
    return ((int(x) + 0x80000000) & 0xFFFFFFFF) - 0x80000000


def imul(a: int, b: int) -> int:
    """JS Math.imul: int32 product with wraparound."""
    return i32(a * b)


def cdiv(a: int, b: int) -> int:
    """C int32 division: truncates toward zero (JS Math.trunc(a / b))."""
    q = abs(a) // abs(b)
    return q if (a < 0) == (b < 0) else -q


def js_round(x: float) -> int:
    """JS Math.round: floor(x + 0.5), unlike Python's half-to-even round()."""
    return math.floor(x + 0.5)
