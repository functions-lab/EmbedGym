import pytest

from embedgym_parts.gpio_reports import GpioReports


def reports(watched, now_ns=None):
    events: list = []
    return GpioReports(events.append, watched, now_ns), events


def test_reports_only_watched_pins():
    gpio, events = reports([10])
    gpio.changed(9, 1)
    gpio.changed(10, 1)
    assert events == [{'type': 'gpio_change', 'pin': 10, 'state': 1}]


def test_stamps_changes_with_the_clock():
    gpio, events = reports([10], now_ns=lambda: 1234)
    gpio.changed(10, 0)
    assert events == [{'type': 'gpio_change', 'pin': 10, 'state': 0, 't_ns': 1234}]


def test_newly_watched_pin_reports_its_last_level_without_t_ns():
    gpio, events = reports([], now_ns=lambda: 1234)
    gpio.changed(9, 1)
    gpio.changed(9, 0)
    gpio.watch([9])
    assert events == [{'type': 'gpio_change', 'pin': 9, 'state': 0}]
    gpio.changed(9, 1)
    assert events[-1] == {'type': 'gpio_change', 'pin': 9, 'state': 1, 't_ns': 1234}


def test_still_watched_and_never_changed_pins_report_nothing_on_watch():
    gpio, events = reports([10])
    gpio.changed(10, 1)
    events.clear()
    gpio.watch([10, 11])
    assert events == []


def test_unwatched_pin_stops_reporting():
    gpio, events = reports([10])
    gpio.watch([])
    gpio.changed(10, 1)
    assert events == []


@pytest.mark.parametrize('pins', [['10'], [10.0], [True]])
def test_rejects_pins_that_are_not_gpio_numbers(pins):
    with pytest.raises(ValueError, match='GPIO numbers'):
        GpioReports(lambda event: None, pins)
    gpio, _ = reports([])
    with pytest.raises(ValueError, match='GPIO numbers'):
        gpio.watch(pins)
