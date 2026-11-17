"""Unit tests for embedgym_parts/membrane_keypad.py (KeypadMatrix)."""
from __future__ import annotations

import pytest

from embedgym_parts.membrane_keypad import KeypadMatrix


UNDRIVEN = (None, None)


def test_keypad_key_carries_the_row_drive_to_its_column():
    matrix = KeypadMatrix(lambda msg: None)
    matrix.press([(1, 2)])
    nodes = [(True, None), (False, None), (True, None), (True, None),
             (None, True), (None, True), (None, True), (None, True)]
    assert matrix.levels(nodes) == [None, None, None, None, True, True, False, True]


def test_keypad_undriven_net_takes_its_pull_or_floats_high():
    matrix = KeypadMatrix(lambda msg: None)
    matrix.press([(0, 0)])
    nodes = [(None, False), UNDRIVEN, UNDRIVEN, UNDRIVEN, UNDRIVEN, UNDRIVEN, UNDRIVEN, (None, False)]
    assert matrix.levels(nodes) == [False, True, True, True, False, True, True, False]


def test_keypad_short_between_drivers_goes_low_and_warns_once():
    warnings = []
    matrix = KeypadMatrix(warnings.append)
    matrix.press([(0, 0)])
    nodes = [(True, None), UNDRIVEN, UNDRIVEN, UNDRIVEN, (False, None), UNDRIVEN, UNDRIVEN, None]
    matrix.levels(nodes)
    matrix.levels(nodes)
    assert len(warnings) == 1
    nodes[1] = UNDRIVEN
    matrix.press([(0, 0), (1, 0)])
    assert matrix.levels(nodes)[1] is False


def test_keypad_rejects_a_key_off_the_matrix():
    with pytest.raises(ValueError):
        KeypadMatrix(lambda msg: None).press([(4, 0)])
