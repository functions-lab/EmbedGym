"""Unit tests for embedgym_parts/ds18b20.py (Ds18b20Slave).

Mirrors the browser part's tests (frontend/src/__tests__/ds18b20-protocol.test.ts):
the same wired-AND bus and the same OneWire (Paul Stoffregen) master timings,
bit for bit, with the clock in ns. Confirms the Python port decodes and
answers exactly like the AVR model.
"""
from __future__ import annotations

import pytest

from embedgym_parts.ds18b20 import Ds18b20Slave, crc8


def us(n: float) -> int:
    return round(n * 1000)


class Bus:
    """Wired-AND bus on a ns clock: the master and the slave each pull LOW or release."""

    def __init__(self, get_temperature):
        self.t = 0
        self.master_low = False
        self.slave_low = False
        self.line = True
        self.pending = []
        self.dev = Ds18b20Slave(get_temperature, self._schedule)

    def pull(self):
        self.master_low = True
        self._settle()

    def release(self):
        self.master_low = False
        self._settle()

    def sample(self) -> bool:
        return self.line

    def advance(self, microseconds: float):
        target = self.t + us(microseconds)
        while self.pending and self.pending[0][0] <= target:
            at, low = self.pending.pop(0)
            self.t = at
            self.slave_low = low
            self._settle()
        self.t = target

    def _schedule(self, low: bool, at: int):
        if at <= self.t:
            self.slave_low = low
            self._settle()
            return
        self.pending.append((at, low))
        self.pending.sort(key=lambda e: e[0])

    def _settle(self):
        high = not self.master_low and not self.slave_low
        if high == self.line:
            return
        self.line = high
        self.dev.on_line(high, self.t)


class Master:
    def __init__(self, bus: Bus):
        self.bus = bus
        self.reset_search()

    def reset(self) -> bool:
        self.bus.pull()
        self.bus.advance(480)
        self.bus.release()
        self.bus.advance(70)
        presence = not self.bus.sample()
        self.bus.advance(410)
        return presence

    def write_bit(self, bit: int):
        self.bus.pull()
        if bit:
            self.bus.advance(10)
            self.bus.release()
            self.bus.advance(55)
        else:
            self.bus.advance(65)
            self.bus.release()
            self.bus.advance(5)

    def read_bit(self) -> int:
        self.bus.pull()
        self.bus.advance(3)
        self.bus.release()
        self.bus.advance(10)
        r = 1 if self.bus.sample() else 0
        self.bus.advance(53)
        return r

    def write(self, v: int):
        for i in range(8):
            self.write_bit((v >> i) & 1)

    def read(self) -> int:
        r = 0
        for i in range(8):
            if self.read_bit():
                r |= 1 << i
        return r

    def read_bytes(self, n: int):
        return [self.read() for _ in range(n)]

    def select(self, rom):
        self.write(0x55)
        for b in rom:
            self.write(b)

    def skip(self):
        self.write(0xCC)

    def reset_search(self):
        self.last_discrepancy = 0
        self.last_device_flag = False
        self.rom_no = [0] * 8

    def search(self, alarm_only=False):
        """Port of OneWire::search -- the discrepancy walk."""
        id_bit_number = 1
        last_zero = 0
        rom_byte_number = 0
        rom_byte_mask = 1
        search_result = False
        if not self.last_device_flag:
            if not self.reset():
                self.reset_search()
                return None
            self.write(0xEC if alarm_only else 0xF0)
            while True:
                id_bit = self.read_bit()
                cmp_id_bit = self.read_bit()
                if id_bit == 1 and cmp_id_bit == 1:
                    break
                if id_bit != cmp_id_bit:
                    direction = id_bit
                else:
                    if id_bit_number < self.last_discrepancy:
                        direction = 1 if self.rom_no[rom_byte_number] & rom_byte_mask else 0
                    else:
                        direction = 1 if id_bit_number == self.last_discrepancy else 0
                    if direction == 0:
                        last_zero = id_bit_number
                if direction:
                    self.rom_no[rom_byte_number] |= rom_byte_mask
                else:
                    self.rom_no[rom_byte_number] &= ~rom_byte_mask
                self.write_bit(direction)
                id_bit_number += 1
                rom_byte_mask <<= 1
                if rom_byte_mask == 0x100:
                    rom_byte_number += 1
                    rom_byte_mask = 1
                if rom_byte_number >= 8:
                    break
            if id_bit_number >= 65:
                self.last_discrepancy = last_zero
                if self.last_discrepancy == 0:
                    self.last_device_flag = True
                search_result = True
        if not search_result or not self.rom_no[0]:
            self.reset_search()
            return None
        return list(self.rom_no)


class Rig:
    def __init__(self, temperature=25.0):
        self.temp = temperature
        self.bus = Bus(lambda: self.temp)
        self.master = Master(self.bus)
        self.dev = self.bus.dev

    def read_scratchpad(self):
        assert self.master.reset()
        self.master.skip()
        self.master.write(0xBE)
        sp = self.master.read_bytes(9)
        assert crc8(sp, 8) == sp[8]
        return sp

    def start_conversion(self):
        assert self.master.reset()
        self.master.skip()
        self.master.write(0x44)

    def poll_until_done(self) -> float:
        """Poll read slots until the part answers 1, as DallasTemperature does; returns the ms spent."""
        start = self.bus.t
        for _ in range(20_000):
            if self.master.read_bit() == 1:
                return (self.bus.t - start) / 1_000_000
        raise AssertionError('ds18b20 still busy after 20000 polls')

    def convert(self) -> float:
        self.start_conversion()
        return self.poll_until_done()

    def write_scratchpad(self, th, tl, config):
        assert self.master.reset()
        self.master.skip()
        self.master.write(0x4E)
        self.master.write(th)
        self.master.write(tl)
        self.master.write(config)


def temp_c(sp) -> float:
    raw = (sp[1] << 8) | sp[0]
    if raw & 0x8000:
        raw -= 0x10000
    return raw / 16


# ── reset, ROM commands ─────────────────────────────────────────────────────

def test_reset_answers_with_presence_every_time():
    r = Rig()
    assert r.master.reset()
    assert r.master.reset()


def test_short_low_is_a_slot_not_a_reset():
    r = Rig()
    r.bus.pull()
    r.bus.advance(100)
    r.bus.release()
    r.bus.advance(70)
    assert r.bus.sample() is True


def _write_with_one_low(bus: Bus, v: int, one_low_us: float):
    """A write slot's bit is the line level at the part's typical 30 us sample point."""
    for i in range(8):
        bus.pull()
        if (v >> i) & 1:
            bus.advance(one_low_us)
            bus.release()
            bus.advance(65 - one_low_us)
        else:
            bus.advance(65)
            bus.release()
            bus.advance(5)


def test_write1_released_before_30us_reads_as_1():
    r = Rig()
    assert r.master.reset()
    _write_with_one_low(r.bus, 0xCC, 20)
    r.master.write(0xBE)
    sp = r.master.read_bytes(9)
    assert crc8(sp, 8) == sp[8]


def test_write1_held_past_30us_reads_as_0():
    r = Rig()
    assert r.master.reset()
    with pytest.raises(ValueError, match=r'unsupported ROM command 0x0$'):
        _write_with_one_low(r.bus, 0xCC, 40)


def test_read_rom_returns_family_0x28_with_valid_crc():
    r = Rig()
    assert r.master.reset()
    r.master.write(0x33)
    rom = r.master.read_bytes(8)
    assert rom[0] == 0x28
    assert crc8(rom, 7) == rom[7]
    assert rom == r.dev.rom


def test_read_rom_selects_the_part_for_a_function_command():
    r = Rig()
    r.master.reset()
    r.master.write(0x33)
    r.master.read_bytes(8)
    r.master.write(0xBE)
    sp = r.master.read_bytes(9)
    assert crc8(sp, 8) == sp[8]
    assert sp[4] == 0x7F


def test_search_rom_walks_to_the_one_device_then_reports_no_more():
    r = Rig()
    assert r.master.search() == r.dev.rom
    assert r.master.search() is None
    r.master.reset_search()
    assert r.master.search() == r.dev.rom


def test_search_steered_away_deselects_the_part():
    r = Rig()
    r.master.reset()
    r.master.write(0xF0)
    bit0 = r.dev.rom[0] & 1
    assert r.master.read_bit() == bit0
    assert r.master.read_bit() == bit0 ^ 1
    r.master.write_bit(bit0 ^ 1)
    assert r.master.read_bit() == 1
    assert r.master.read_bit() == 1


def test_match_rom_selects_and_a_one_bit_miss_leaves_the_bus_undriven():
    r = Rig()
    r.master.reset()
    r.master.select(r.dev.rom)
    r.master.write(0xBE)
    sp = r.master.read_bytes(9)
    assert crc8(sp, 8) == sp[8]

    wrong = list(r.dev.rom)
    wrong[3] ^= 0x10
    r.master.reset()
    r.master.select(wrong)
    r.master.write(0xBE)
    assert r.master.read_bytes(9) == [0xFF] * 9


def test_deselected_part_ignores_even_an_unknown_command():
    r = Rig()
    wrong = list(r.dev.rom)
    wrong[0] ^= 1
    r.master.reset()
    r.master.select(wrong)
    r.master.write(0xA5)


def test_skip_rom_selects_the_part():
    r = Rig()
    assert len(r.read_scratchpad()) == 9


def test_unsupported_rom_command_raises():
    r = Rig()
    r.master.reset()
    with pytest.raises(ValueError, match="unsupported ROM command 0xa5"):
        r.master.write(0xA5)


def test_unsupported_function_command_raises():
    r = Rig()
    r.master.reset()
    r.master.skip()
    with pytest.raises(ValueError, match="unsupported function command 0x0"):
        r.master.write(0x00)


# ── scratchpad and conversion ───────────────────────────────────────────────

def test_power_on_scratchpad():
    sp = Rig().read_scratchpad()
    assert sp[:8] == [0x50, 0x05, 0x4B, 0x46, 0x7F, 0xFF, 0x0C, 0x10]
    assert temp_c(sp) == 85


def test_convert_latches_on_sixteenth_degree_steps():
    r = Rig(25.0625)
    r.convert()
    sp = r.read_scratchpad()
    assert sp[:2] == [0x91, 0x01]
    assert temp_c(sp) == 25.0625


@pytest.mark.parametrize('config,ms', [(0x1F, 75), (0x3F, 150), (0x5F, 300), (0x7F, 600)])
def test_busy_poll_answers_0_for_the_conversion_then_1(config, ms):
    r = Rig()
    r.write_scratchpad(0x4B, 0x46, config)
    elapsed = r.convert()
    assert ms <= elapsed < ms + 0.15
    for _ in range(5):
        assert r.master.read_bit() == 1


def test_mid_conversion_scratchpad_holds_the_previous_reading():
    r = Rig(20)
    r.start_conversion()
    assert temp_c(r.read_scratchpad()) == 85
    r.bus.advance(600_000)
    assert temp_c(r.read_scratchpad()) == 20
    r.temp = 40
    r.start_conversion()
    r.bus.advance(590_000)
    assert temp_c(r.read_scratchpad()) == 20
    r.bus.advance(10_000)
    assert temp_c(r.read_scratchpad()) == 40


def test_temperature_is_sampled_when_convert_is_issued():
    r = Rig(20)
    r.start_conversion()
    r.temp = 40
    r.poll_until_done()
    assert temp_c(r.read_scratchpad()) == 20


def test_convert_issued_mid_conversion_is_ignored():
    r = Rig(20)
    r.start_conversion()
    start = r.bus.t
    r.bus.advance(300_000)
    r.temp = 40
    r.start_conversion()
    r.poll_until_done()
    assert 600 <= (r.bus.t - start) / 1_000_000 < 600.15
    assert temp_c(r.read_scratchpad()) == 20


def test_temperature_change_needs_a_new_conversion():
    r = Rig(20)
    r.convert()
    r.temp = 40
    assert temp_c(r.read_scratchpad()) == 20
    r.convert()
    assert temp_c(r.read_scratchpad()) == 40


def test_negative_and_extreme_temperatures():
    r = Rig(-10.125)
    r.convert()
    sp = r.read_scratchpad()
    assert sp[:2] == [0x5E, 0xFF]
    assert temp_c(sp) == -10.125
    r.temp = -55
    r.convert()
    sp = r.read_scratchpad()
    assert sp[:2] == [0x90, 0xFC]
    assert temp_c(sp) == -55
    r.temp = 125
    r.convert()
    sp = r.read_scratchpad()
    assert sp[:2] == [0xD0, 0x07]
    assert temp_c(sp) == 125


def test_read_power_supply_idles_high():
    r = Rig()
    r.master.reset()
    r.master.skip()
    r.master.write(0xB4)
    assert r.master.read_bit() == 1


def test_write_scratchpad_stores_th_tl_and_config_bits():
    r = Rig()
    r.write_scratchpad(0x1E, 0xEC, 0x1F)
    sp = r.read_scratchpad()
    assert sp[2:5] == [0x1E, 0xEC, 0x1F]
    assert r.dev.resolution_bits == 9
    r.write_scratchpad(0x1E, 0xEC, 0x00)
    assert r.read_scratchpad()[4] == 0x1F
    r.write_scratchpad(0x1E, 0xEC, 0xFF)
    assert r.read_scratchpad()[4] == 0x7F
    assert r.dev.resolution_bits == 12


@pytest.mark.parametrize("config,bits,expected", [
    (0x7F, 12, 25.9375),
    (0x5F, 11, 25.875),
    (0x3F, 10, 25.75),
    (0x1F, 9, 25.5),
])
def test_resolution_truncates_low_bits(config, bits, expected):
    r = Rig(25.9375)
    r.write_scratchpad(0x4B, 0x46, config)
    assert r.dev.resolution_bits == bits
    r.convert()
    assert temp_c(r.read_scratchpad()) == expected


def test_lower_resolution_zeroes_low_bits_of_a_negative_reading():
    r = Rig(-10.0625)
    r.write_scratchpad(0x4B, 0x46, 0x1F)
    r.convert()
    assert temp_c(r.read_scratchpad()) == -10.5


def test_recall_e2_restores_eeprom_and_poll_answers_done():
    r = Rig()
    r.write_scratchpad(0x1E, 0xEC, 0x1F)
    r.master.reset()
    r.master.skip()
    r.master.write(0xB8)
    assert r.master.read_bit() == 1
    assert r.read_scratchpad()[2:5] == [0x4B, 0x46, 0x7F]


def test_copy_scratchpad_polls_0_for_the_2ms_eeprom_write():
    r = Rig()
    assert r.master.reset()
    r.master.skip()
    r.master.write(0x48)
    assert 2 <= r.poll_until_done() < 2.15


def test_copy_scratchpad_commits_to_eeprom():
    r = Rig()
    r.write_scratchpad(0x1E, 0xEC, 0x3F)
    r.master.reset()
    r.master.skip()
    r.master.write(0x48)
    r.write_scratchpad(0x00, 0x00, 0x7F)
    assert r.read_scratchpad()[2:5] == [0x00, 0x00, 0x7F]
    r.master.reset()
    r.master.skip()
    r.master.write(0xB8)
    assert r.read_scratchpad()[2:5] == [0x1E, 0xEC, 0x3F]


# ── alarm flag and Alarm Search ─────────────────────────────────────────────

def test_no_conversion_yet_no_alarm():
    r = Rig()
    assert r.dev.alarm_flag is False
    assert r.master.search(alarm_only=True) is None


def test_default_th_tl_make_room_temperature_an_alarm():
    r = Rig(25)
    r.convert()
    assert r.dev.alarm_flag is True
    assert r.master.search(alarm_only=True) == r.dev.rom


@pytest.mark.parametrize("temperature,alarmed", [
    (25, False),
    (29.9375, False),
    (30, True),
    (40, True),
    (-19, False),
    (-19.5, True),
    (-20, True),
    (-30, True),
])
def test_th30_tl_minus20_compares_the_integer_part(temperature, alarmed):
    r = Rig(temperature)
    r.write_scratchpad(30, 0xEC, 0x7F)
    r.convert()
    assert r.dev.alarm_flag is alarmed
    assert r.master.search(alarm_only=True) == (r.dev.rom if alarmed else None)
