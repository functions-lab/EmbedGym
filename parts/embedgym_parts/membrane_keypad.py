"""4x4 membrane keypad matrix. embedgym_parts/registry.py reports what the firmware
drives on each of the eight nodes and writes back the levels `levels`
resolves."""
from __future__ import annotations

from typing import Callable, Optional

KEYPAD_ROWS = 4
KEYPAD_COLUMNS = 4


class KeypadMatrix:
    """Eight nodes, rows 0-3 then columns 0-3. A pressed key at (row, column)
    shorts node `row` to node `4 + column`. Shorted nodes share one level: LOW
    if any pin on them drives LOW, else HIGH if one drives HIGH, else pulled
    up, else pulled down, else HIGH (floating)."""

    def __init__(self, warn: Callable[[str], None]) -> None:
        self._warn = warn
        self.pressed: set[tuple[int, int]] = set()
        self._warned: set[frozenset] = set()

    def press(self, keys) -> None:
        pressed = {(int(row), int(column)) for row, column in keys}
        for row, column in pressed:
            if not (0 <= row < KEYPAD_ROWS and 0 <= column < KEYPAD_COLUMNS):
                raise ValueError(f'membrane-keypad: no key at row {row}, column {column}')
        self.pressed = pressed

    def levels(self, nodes: list[Optional[tuple[Optional[bool], Optional[bool]]]]) -> list[Optional[bool]]:
        """`nodes[i]` is None when unwired, else (drive, pull): drive is the
        level the firmware drives or None, pull is True (up), False (down) or
        None. Returns the net level of every wired, undriven node, else None."""
        if len(nodes) != KEYPAD_ROWS + KEYPAD_COLUMNS:
            raise ValueError(f'membrane-keypad: expected {KEYPAD_ROWS + KEYPAD_COLUMNS} nodes, got {len(nodes)}')
        group = list(range(len(nodes)))

        def find(n: int) -> int:
            while group[n] != n:
                group[n] = group[group[n]]
                n = group[n]
            return n

        for row, column in self.pressed:
            group[find(row)] = find(KEYPAD_ROWS + column)

        driven: dict[int, set] = {}
        pulls: dict[int, set] = {}
        for node, state in enumerate(nodes):
            if state is None:
                continue
            drive, pull = state
            root = find(node)
            if drive is not None:
                driven.setdefault(root, set()).add(drive)
            elif pull is not None:
                pulls.setdefault(root, set()).add(pull)

        for root, levels in driven.items():
            members = frozenset(n for n in range(len(nodes)) if find(n) == root)
            if len(levels) == 2 and members not in self._warned:
                self._warned.add(members)
                self._warn('membrane-keypad: a pressed key shorts a pin driving HIGH to one driving LOW; LOW wins')

        result: list[Optional[bool]] = []
        for node, state in enumerate(nodes):
            if state is None or state[0] is not None:
                result.append(None)
                continue
            root = find(node)
            if root in driven:
                result.append(False not in driven[root])
            elif root in pulls:
                result.append(True in pulls[root])
            else:
                result.append(True)
        return result
