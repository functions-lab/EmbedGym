"""Unit tests for embedgym_parts/i2c/max17048.py (MAX17048Slave): the cases of
max17048-protocol.test.ts over the picsimlab I2C event encoding, with the
worker's timer contract in place of the AVR part's clock events."""
from __future__ import annotations

import pytest

from embedgym_parts.i2c.max17048 import MAX17048Slave
from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_READ, I2C_START_RECV, I2C_START_SEND
from i2c_bus import MS_NS, write_event


class Harness:
    """The worker's side of the slave: a virtual clock, the INT level log and
    the one timer the slave arms through on_conversion_scheduled."""

    def __init__(self, **cell) -> None:
        self.now = 0
        self.due: int | None = None
        self.pins: list[tuple[float, bool]] = []
        self.dev = MAX17048Slave(lambda: self.now, self._int, self._schedule)
        self.dev.update({'batteryConnected': True, 'cellVoltage': 3.8, 'openCircuitVoltage': 3.8,
                         'stateOfCharge': 50, 'chargeRate': 0, **cell}, self.now)

    def _int(self, asserted: bool) -> None:
        self.pins.append((self.now / MS_NS, not asserted))

    def _schedule(self, due_ns: int) -> None:
        assert due_ns >= self.now
        self.due = due_ns

    def advance(self, ms: float) -> None:
        target = self.now + round(ms * MS_NS)
        while self.due is not None and self.due <= target:
            self.now = self.due
            self.due = None
            self.dev.tick(self.now)
        self.now = target

    def cell(self, **values) -> None:
        self.dev.update(values, self.now)

    def int_high(self) -> bool:
        return not self.dev.interrupt_asserted


def write(h: Harness, reg: int, *data: int) -> bool:
    """Pointer then data bytes; True when every data byte was ACKed."""
    dev = h.dev
    assert dev.handle_event(I2C_START_SEND) == 0
    assert dev.handle_event(write_event(reg)) == 0
    ack = True
    for byte in data:
        ack = dev.handle_event(write_event(byte)) == 0
    dev.handle_event(I2C_FINISH)
    return ack


def word_write(h: Harness, reg: int, value: int) -> bool:
    return write(h, reg, value >> 8, value & 255)


def read(h: Harness, reg: int, count: int = 2) -> list[int]:
    write(h, reg)
    assert h.dev.handle_event(I2C_START_RECV) == 0
    data = [h.dev.handle_event(I2C_READ) for _ in range(count)]
    h.dev.handle_event(I2C_FINISH)
    return data


def word(h: Harness, reg: int) -> int:
    high, low = read(h, reg)
    return (high << 8) | low


def signed(value: int) -> int:
    return value - 0x10000 if value & 0x8000 else value


def volts(h: Harness) -> float:
    return word(h, 0x02) * 0.000078125


def test_defaults_factory_id_and_delayed_first_soc_and_voltage():
    h = Harness()
    assert h.dev.addr == 0x36
    assert word(h, 0x08) & 0xFFF0 == 0x10
    assert word(h, 0x0A) == 0x8030
    assert word(h, 0x0C) == 0x971C
    assert word(h, 0x18) == 0x9648
    assert word(h, 0x1A) == 0x0100
    assert word(h, 0xFE) == 0xFFFF
    h.advance(191.999)
    assert word(h, 0x04) == 0
    h.advance(0.001)
    assert word(h, 0x04) == 50 * 256
    h.advance(57.999)
    assert word(h, 0x02) == 0
    h.advance(0.001)
    assert volts(h) == pytest.approx(3.8, abs=1e-5)


def test_averages_four_adc_samples_on_the_250ms_clock():
    h = Harness()
    h.advance(125)
    h.cell(cellVoltage=4.0)
    assert word(h, 0x02) == 0
    h.advance(125)
    assert volts(h) == pytest.approx(3.9, abs=1e-5)
    h.advance(250)
    assert volts(h) == pytest.approx(4.0, abs=1e-5)


def test_signed_crate_and_integrated_soc():
    h = Harness(stateOfCharge=40, chargeRate=36)
    h.advance(1000)
    assert word(h, 0x04) / 256 == pytest.approx(40.01, abs=0.005)
    assert signed(word(h, 0x16)) * 0.208 == pytest.approx(36, abs=0.5)
    h.cell(chargeRate=-72, cellVoltage=4.1)
    h.advance(1000)
    assert word(h, 0x04) / 256 == pytest.approx(39.99, abs=0.005)
    assert signed(word(h, 0x16)) * 0.208 == pytest.approx(-72, abs=0.5)
    h.cell(stateOfCharge=10, chargeRate=0)
    h.advance(1000)
    assert word(h, 0x04) == 2560
    assert word(h, 0x16) == 0


def test_ignores_byte_writes_and_read_only_fields():
    h = Harness()
    for reg in (0x06, 0x0A, 0x0B, 0x0C, 0x14, 0x15, 0x18, 0x1A):
        before = read(h, reg, 1)
        write(h, reg, 0)
        assert read(h, reg, 1) == before
    word_write(h, 0x0C, 0xAB13)
    assert word(h, 0x0C) == 0xAB13
    word_write(h, 0x06, 0x8FFF)
    assert word(h, 0x06) == 0
    for reg in (0x02, 0x04, 0x08, 0x16):
        before = word(h, reg)
        word_write(h, reg, 0xFFFF)
        assert word(h, reg) == before
    word_write(h, 0x18, 0x8842)
    assert word(h, 0x18) == 0x8848


def test_reset_nacks_final_byte_restores_defaults_keeps_cell():
    h = Harness(stateOfCharge=75)
    h.advance(1000)
    word_write(h, 0x0A, 0x0000)
    word_write(h, 0x0C, 0x4011)
    assert word_write(h, 0xFE, 0x5400) is False
    assert word(h, 0x0A) == 0x8030
    assert word(h, 0x04) == 0
    h.advance(192)
    assert word(h, 0x04) == 75 * 256


def test_quick_start_by_mode_bit_and_rising_qstart_edges_only():
    h = Harness()
    h.advance(1000)
    word_write(h, 0x0C, 0x8B1A)
    word_write(h, 0x06, 0x6000)
    assert word(h, 0x06) == 0x2000
    assert word(h, 0x0C) == 0x8B1A
    assert word(h, 0x04) == 0
    h.advance(192)
    h.dev.set_quick_start_pin(True)
    assert word(h, 0x04) == 0
    h.advance(192)
    h.dev.set_quick_start_pin(True)
    assert word(h, 0x04) == 50 * 256
    h.dev.set_quick_start_pin(False)
    h.dev.set_quick_start_pin(True)
    assert word(h, 0x04) == 0


def test_software_sleep_needs_ensleep_and_holds_until_wake():
    h = Harness()
    h.advance(1000)
    word_write(h, 0x0C, 0x979C)
    h.cell(stateOfCharge=20)
    h.advance(1000)
    assert word(h, 0x04) == 20 * 256
    word_write(h, 0x06, 0x2000)
    h.cell(stateOfCharge=60, cellVoltage=4.0)
    h.advance(3000)
    assert word(h, 0x04) == 20 * 256
    assert volts(h) == pytest.approx(3.8, abs=1e-5)
    word_write(h, 0x0C, 0x971C)
    h.advance(1000)
    assert word(h, 0x04) == 60 * 256
    assert volts(h) == pytest.approx(4.0, abs=1e-5)


def test_bus_sleep_after_both_lines_low_for_2500ms_and_wake_on_either_line():
    h = Harness()
    h.advance(1000)
    word_write(h, 0x06, 0x2000)
    h.dev.set_bus_pins(False, False)
    h.advance(2499)
    h.cell(cellVoltage=4)
    h.advance(1)
    h.advance(1000)
    assert volts(h) == pytest.approx(3.8, abs=1e-5)
    h.dev.set_bus_pins(True, False)
    h.advance(250)
    assert volts(h) == pytest.approx(4.0, abs=1e-5)


def test_forced_hibernate_updates_every_45s_and_hibstat_is_read_only():
    h = Harness()
    h.advance(1000)
    word_write(h, 0x0A, 0xFFFF)
    assert word(h, 0x06) & 0x1000 == 0x1000
    word_write(h, 0x06, 0)
    assert word(h, 0x06) & 0x1000 == 0x1000
    h.cell(stateOfCharge=60, cellVoltage=4)
    h.advance(44999)
    assert word(h, 0x04) == 50 * 256
    h.advance(1)
    assert word(h, 0x04) == 60 * 256
    assert volts(h) == pytest.approx(4.0, abs=1e-5)
    word_write(h, 0x0A, 0)
    assert word(h, 0x06) == 0


def test_automatic_hibernate_after_six_low_rate_minutes_exits_on_activity():
    h = Harness()
    h.advance(360000)
    assert word(h, 0x06) & 0x1000 == 0
    h.advance(1000)
    assert word(h, 0x06) & 0x1000 == 0x1000
    h.cell(openCircuitVoltage=4)
    h.advance(45000)
    assert word(h, 0x06) & 0x1000 == 0


def test_threshold_writes_keep_hibernate_and_initial_qstart_level_is_no_edge():
    h = Harness()
    h.advance(1000)
    h.dev.set_quick_start_pin(True, initial=True)
    assert word(h, 0x04) == 50 * 256
    word_write(h, 0x0A, 0xFFFF)
    word_write(h, 0x0A, 0x8030)
    assert word(h, 0x06) & 0x1000 == 0x1000
    h.dev.set_quick_start_pin(False)
    h.dev.set_quick_start_pin(True)
    assert word(h, 0x04) == 0


def test_crate_above_hibthr_resets_the_six_minute_qualifier():
    h = Harness()
    h.advance(300000)
    h.cell(chargeRate=40)
    h.advance(1000)
    h.cell(chargeRate=0)
    h.advance(60000)
    assert word(h, 0x06) & 0x1000 == 0


def test_coinciding_soc_and_adc_clocks_use_fresh_voltage():
    h = Harness()
    h.advance(361000)
    h.cell(cellVoltage=3.9, openCircuitVoltage=3.9, stateOfCharge=60)
    h.advance(45000)
    assert word(h, 0x06) & 0x1000 == 0x1000
    assert word(h, 0x04) == 60 * 256
    assert volts(h) == pytest.approx(3.9, abs=1e-5)


def test_voltage_alerts_latch_int_until_alrt_cleared_and_repeat():
    h = Harness()
    h.advance(1000)
    word_write(h, 0x14, (190 << 8) | 200)
    h.cell(cellVoltage=3.7)
    h.advance(250)
    assert word(h, 0x1A) >> 8 & 4 == 4
    assert word(h, 0x0C) & 0x20 == 0x20
    assert not h.int_high()
    word_write(h, 0x1A, 0)
    assert not h.int_high()
    word_write(h, 0x0C, word(h, 0x0C) & ~0x20)
    assert h.int_high()
    h.advance(250)
    assert not h.int_high()
    h.cell(cellVoltage=4.1)
    h.advance(250)
    assert word(h, 0x1A) >> 8 & 2 == 2


def test_no_alert_at_exact_voltage_thresholds():
    h = Harness()
    h.advance(1000)
    word_write(h, 0x14, (190 << 8) | 190)
    h.advance(1000)
    assert word(h, 0x1A) & 0x0600 == 0
    assert h.int_high()
    assert h.pins == []


def test_low_soc_on_falling_crossing_and_one_percent_change_rearm():
    h = Harness(stateOfCharge=20)
    h.advance(1000)
    word_write(h, 0x0C, 0x9751)
    h.cell(stateOfCharge=15)
    h.advance(1000)
    assert word(h, 0x1A) >> 8 & 0x10 == 0
    h.cell(stateOfCharge=14)
    h.advance(1000)
    assert word(h, 0x1A) >> 8 & 0x30 == 0x30
    word_write(h, 0x1A, 0)
    word_write(h, 0x0C, 0x9751)
    h.advance(1000)
    assert word(h, 0x1A) & 0x3F00 == 0
    h.cell(stateOfCharge=13)
    h.advance(1000)
    assert word(h, 0x1A) & 0x3000 == 0x2000
    word_write(h, 0x1A, 0)
    assert h.int_high()


def test_voltage_reset_rising_crossing_quick_starts_in_1ms_with_envr_alert():
    h = Harness()
    h.advance(1000)
    word_write(h, 0x18, 0xA048)
    word_write(h, 0x1A, 0x4000)
    h.cell(cellVoltage=3.1)
    h.cell(cellVoltage=3.8, stateOfCharge=80)
    h.advance(0.999)
    assert word(h, 0x04) == 50 * 256
    h.advance(0.001)
    assert word(h, 0x04) == 0
    assert word(h, 0x1A) & 0x0800 == 0x0800
    h.advance(192)
    assert word(h, 0x04) == 80 * 256


def test_nacks_without_battery_or_below_2v5_and_resets_on_reinsertion():
    h = Harness(batteryConnected=False)
    assert h.pins == []
    assert h.dev.handle_event(I2C_START_SEND) == 1
    assert h.dev.handle_event(write_event(0x08)) == 1
    assert h.dev.handle_event(I2C_START_RECV) == 1
    assert h.dev.handle_event(I2C_READ) == 0xFF
    h.dev.handle_event(I2C_FINISH)
    h.cell(batteryConnected=True)
    assert h.dev.handle_event(I2C_START_SEND) == 0
    h.dev.handle_event(I2C_FINISH)
    h.advance(1000)
    h.cell(cellVoltage=2.4)
    assert h.dev.handle_event(I2C_START_RECV) == 1
    h.cell(cellVoltage=3.8, stateOfCharge=10)
    assert word(h, 0x04) == 0
    h.advance(192)
    assert word(h, 0x04) == 2560


def test_power_loss_releases_an_asserted_int():
    h = Harness()
    h.advance(1000)
    word_write(h, 0x14, 180)
    h.advance(250)
    assert not h.int_high()
    h.cell(batteryConnected=False)
    assert h.int_high()


def test_hibernate_comparator_off_takes_the_250ms_adc_reset_path_without_envr():
    h = Harness()
    h.advance(1000)
    word_write(h, 0x18, 0xA148)
    word_write(h, 0x0A, 0xFFFF)
    h.cell(cellVoltage=3.1)
    h.advance(45000)
    h.cell(cellVoltage=3.8, stateOfCharge=80)
    h.advance(45000)
    assert word(h, 0x04) == 80 * 256
    h.advance(249.999)
    assert word(h, 0x04) == 80 * 256
    h.advance(0.001)
    assert word(h, 0x04) == 0
    assert word(h, 0x1A) & 0x0800 == 0
    assert h.int_high()


def test_burst_read_is_coherent_across_a_conversion():
    h = Harness()
    h.advance(999)
    h.cell(stateOfCharge=80)
    write(h, 0x04)
    assert h.dev.handle_event(I2C_START_RECV) == 0
    high = h.dev.handle_event(I2C_READ)
    h.advance(1)
    low = h.dev.handle_event(I2C_READ)
    h.dev.handle_event(I2C_FINISH)
    assert (high << 8) | low == 50 * 256
    assert word(h, 0x04) == 80 * 256


def test_rejects_unsupported_registers_custom_model_and_invalid_inputs():
    h = Harness()
    for reg in (0x00, 0x0E, 0x80):
        with pytest.raises(ValueError):
            word_write(h, reg, 0)
        with pytest.raises(ValueError):
            read(h, reg)
    for reg, kind in ((0x3E, 'unlock'), (0x3F, 'unlock'), (0x40, 'TABLE'), (0x7F, 'TABLE')):
        message = f'max17048: custom model {kind} register 0x{reg:x} is unsupported'
        with pytest.raises(ValueError, match=message):
            word_write(h, reg, 0)
        with pytest.raises(ValueError, match=message):
            read(h, reg)
    with pytest.raises(ValueError):
        word_write(h, 0xFE, 0x1234)
    for bad in ({'stateOfCharge': 101}, {'cellVoltage': 5}, {'chargeRate': float('nan')},
                {'batteryConnected': 1}, {'cellVoltage': True}, {'toggleBattery': True}):
        with pytest.raises(ValueError):
            h.cell(**bad)


def test_set_at_park_instant_times_soc_integration_from_that_instant():
    h = Harness(chargeRate=3600)
    h.advance(10)
    h.dev.update({'chargeRate': 0}, 5 * MS_NS)
    h.advance(1000)
    assert word(h, 0x04) == round((50 + 3600 * 5 / 3_600_000) * 256)
