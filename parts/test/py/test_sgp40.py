"""Unit tests for embedgym_parts/i2c/sgp40.py (SGP40Slave): the frontend-mirroring cases
over the picsimlab I2C event encoding, then the register-level cases."""
from __future__ import annotations

import unittest

import pytest

from esp32_i2c_slaves import I2C_FINISH, I2C_READ, I2C_START_RECV, I2C_START_SEND
from embedgym_parts.i2c.sgp40 import SGP40Slave, sensirion_crc8
from i2c_bus import MS_NS, write_event


# ─── SGP40 (sgp40-protocol.test.ts) ──────────────────────────────────────────
# The byte sequences are Adafruit_SGP40.cpp's. Each command is one write
# transaction; the result is a separate read transaction, whose header the
# slave NACKs while the command is still executing.


class Sgp40Harness:
    def __init__(self, raw: float = 30000) -> None:
        self.now = 0
        self.dev = SGP40Slave(lambda: self.now)
        self.dev.update(raw)

    def advance(self, ms: float) -> None:
        self.now += round(ms * MS_NS)


def sgp_write(dev, *data: int) -> None:
    """One master write transaction: START, bytes, STOP."""
    assert dev.handle_event(I2C_START_SEND) == 0
    for b in data:
        assert dev.handle_event(write_event(b)) == 0
    dev.handle_event(I2C_FINISH)


def sgp_read(dev, n: int) -> list[int] | None:
    """One master read transaction; None when the slave NACKs the header (QEMU's
    core then ends the transfer, so the slave still sees a I2C_FINISH)."""
    if dev.handle_event(I2C_START_RECV) != 0:
        dev.handle_event(I2C_FINISH)
        return None
    out = [dev.handle_event(I2C_READ) for _ in range(n)]
    dev.handle_event(I2C_FINISH)
    return out


def sgp_decode_word(data: list[int] | None) -> int | None:
    """readWordFromCommand: None on a NACK or a CRC mismatch (the library then reports 0)."""
    if data is None:
        return None
    msb, lsb, crc = data
    if sensirion_crc8([msb, lsb]) != crc:
        return None
    return (msb << 8) | lsb


def sgp_measure_command(temperature: float, humidity: float) -> list[int]:
    """The 8-byte measure command Adafruit_SGP40::measureRaw builds."""
    rhticks = int(humidity * 65535 / 100 + 0.5)
    tempticks = int((temperature + 45) * 65535 / 175)
    rh = [(rhticks >> 8) & 0xFF, rhticks & 0xFF]
    t = [(tempticks >> 8) & 0xFF, tempticks & 0xFF]
    return [0x26, 0x0F, *rh, sensirion_crc8(rh), *t, sensirion_crc8(t)]


def test_sgp40_crc_matches_the_datasheet_check_value_and_the_library_defaults():
    assert sensirion_crc8([0xBE, 0xEF]) == 0x92
    assert sensirion_crc8([0x80, 0x00]) == 0xA2
    assert sensirion_crc8([0x66, 0x66]) == 0x93


def test_sgp40_acks_the_empty_address_probe_without_disturbing_state():
    h = Sgp40Harness()
    assert h.dev.addr == 0x59
    sgp_write(h.dev)
    sgp_write(h.dev, 0x20, 0x2F)
    assert sgp_decode_word(sgp_read(h.dev, 3)) == 0x0020


def test_sgp40_serial_number_is_three_crc_checked_words():
    h = Sgp40Harness()
    sgp_write(h.dev, 0x36, 0x82)
    h.advance(10)
    reply = sgp_read(h.dev, 9)
    words = [sgp_decode_word(reply[i:i + 3]) for i in (0, 3, 6)]
    assert words == [0x0000, 0x1234, 0x5678]


def test_sgp40_featureset_and_self_test_answer_the_library_constants():
    h = Sgp40Harness()
    sgp_write(h.dev, 0x20, 0x2F)
    h.advance(10)
    assert sgp_decode_word(sgp_read(h.dev, 3)) == 0x0020
    sgp_write(h.dev, 0x28, 0x0E)
    h.advance(500)
    assert sgp_decode_word(sgp_read(h.dev, 3)) == 0xD400


def test_sgp40_measure_raw_returns_the_driven_signal_and_tracks_a_change():
    h = Sgp40Harness(30512)
    sgp_write(h.dev, *sgp_measure_command(25, 50))
    h.advance(250)
    assert sgp_decode_word(sgp_read(h.dev, 3)) == 30512
    h.dev.update(41234)
    sgp_write(h.dev, *sgp_measure_command(25, 50))
    h.advance(250)
    assert sgp_decode_word(sgp_read(h.dev, 3)) == 41234


def test_sgp40_accepts_the_exact_default_byte_sequence_and_full_scale():
    h = Sgp40Harness(65535)
    sgp_write(h.dev, 0x26, 0x0F, 0x80, 0x00, 0xA2, 0x66, 0x66, 0x93)
    h.advance(250)
    assert sgp_decode_word(sgp_read(h.dev, 3)) == 65535


def test_sgp40_rounds_the_raw_value_like_js_math_round():
    h = Sgp40Harness(30000.5)
    sgp_write(h.dev, *sgp_measure_command(25, 50))
    h.advance(250)
    assert sgp_decode_word(sgp_read(h.dev, 3)) == 30001


def test_sgp40_decodes_the_compensation_ticks():
    h = Sgp40Harness()
    sgp_write(h.dev, *sgp_measure_command(25, 50))
    assert h.dev.humidity == pytest.approx(50, abs=0.1)
    assert h.dev.temperature == pytest.approx(25, abs=0.1)
    sgp_write(h.dev, *sgp_measure_command(-10, 88.5))
    assert h.dev.humidity == pytest.approx(88.5, abs=0.1)
    assert h.dev.temperature == pytest.approx(-10, abs=0.1)


def test_sgp40_nacks_a_read_before_the_command_completes_and_keeps_the_result():
    h = Sgp40Harness()
    sgp_write(h.dev, *sgp_measure_command(25, 50))
    h.advance(5)
    assert sgp_read(h.dev, 3) is None
    h.advance(25)
    assert sgp_decode_word(sgp_read(h.dev, 3)) == 30000
    sgp_write(h.dev, 0x28, 0x0E)
    h.advance(10)
    assert sgp_read(h.dev, 3) is None
    h.advance(310)
    assert sgp_decode_word(sgp_read(h.dev, 3)) == 0xD400


def test_sgp40_a_datasheet_maximum_wait_one_tick_short_still_reads():
    # Sensirion's driver waits 30 / 320 ms; vTaskDelay of that undershoots by a tick.
    h = Sgp40Harness()
    sgp_write(h.dev, *sgp_measure_command(25, 50))
    h.advance(29)
    assert sgp_decode_word(sgp_read(h.dev, 3)) == 30000
    sgp_write(h.dev, 0x28, 0x0E)
    h.advance(319)
    assert sgp_decode_word(sgp_read(h.dev, 3)) == 0xD400


def test_sgp40_repeated_start_read_works_for_stored_values_only():
    h = Sgp40Harness()
    # i2c_master_write_read_device: I2C_FINISH + I2C_START_RECV with no time passing.
    assert h.dev.handle_event(I2C_START_SEND) == 0
    for b in (0x20, 0x2F):
        assert h.dev.handle_event(write_event(b)) == 0
    h.dev.handle_event(I2C_FINISH)
    assert sgp_decode_word(sgp_read(h.dev, 3)) == 0x0020
    assert h.dev.handle_event(I2C_START_SEND) == 0
    for b in sgp_measure_command(25, 50):
        assert h.dev.handle_event(write_event(b)) == 0
    h.dev.handle_event(I2C_FINISH)
    assert h.dev.handle_event(I2C_START_RECV) == 1


def test_sgp40_a_repeated_start_with_no_finish_runs_the_written_command():
    # The AVR and nRF buses send a repeated START with no FINISH before it.
    h = Sgp40Harness()
    assert h.dev.handle_event(I2C_START_SEND) == 0
    for b in (0x20, 0x2F):
        assert h.dev.handle_event(write_event(b)) == 0
    assert h.dev.handle_event(I2C_START_RECV) == 0
    assert sgp_decode_word([h.dev.handle_event(I2C_READ) for _ in range(3)]) == 0x0020
    h.dev.handle_event(I2C_FINISH)
    assert h.dev.handle_event(I2C_START_SEND) == 0
    for b in sgp_measure_command(25, 50):
        assert h.dev.handle_event(write_event(b)) == 0
    assert h.dev.handle_event(I2C_START_RECV) == 1
    h.dev.handle_event(I2C_FINISH)
    h.advance(30)
    assert sgp_decode_word(sgp_read(h.dev, 3)) == 30000


def test_sgp40_nacks_a_read_with_nothing_queued_and_over_reads_as_0xff():
    h = Sgp40Harness()
    assert sgp_read(h.dev, 3) is None
    sgp_write(h.dev, 0x20, 0x2F)
    reply = sgp_read(h.dev, 4)
    assert reply[3] == 0xFF
    assert sgp_read(h.dev, 3) is None
    sgp_write(h.dev, 0x36, 0x15)
    assert sgp_read(h.dev, 3) is None


def test_sgp40_heater_off_and_the_next_measurement_wakes_it():
    h = Sgp40Harness()
    assert h.dev.heater_on is True
    sgp_write(h.dev, 0x36, 0x15)
    assert h.dev.heater_on is False
    sgp_write(h.dev, *sgp_measure_command(25, 50))
    assert h.dev.heater_on is True


def test_sgp40_soft_reset_restores_defaults():
    h = Sgp40Harness()
    sgp_write(h.dev, *sgp_measure_command(-10, 88.5))
    sgp_write(h.dev, 0x36, 0x15)
    sgp_write(h.dev, 0x00, 0x06)
    assert h.dev.heater_on is True
    assert h.dev.humidity == pytest.approx(50, abs=0.1)
    assert h.dev.temperature == pytest.approx(25, abs=0.1)
    assert sgp_read(h.dev, 3) is None


def test_sgp40_raises_on_a_bad_compensation_crc():
    h = Sgp40Harness()
    cmd = sgp_measure_command(25, 50)
    cmd[4] ^= 0xFF
    with pytest.raises(ValueError, match='CRC'):
        sgp_write(h.dev, *cmd)
    cmd = sgp_measure_command(25, 50)
    cmd[7] ^= 0xFF
    with pytest.raises(ValueError, match='CRC'):
        sgp_write(h.dev, *cmd)


def test_sgp40_raises_when_the_compensation_words_are_missing():
    with pytest.raises(ValueError, match='compensation'):
        sgp_write(Sgp40Harness().dev, 0x26, 0x0F)


def test_sgp40_raises_on_unknown_truncated_or_over_long_commands():
    with pytest.raises(ValueError, match='unsupported command'):
        sgp_write(Sgp40Harness().dev, 0x12, 0x34)
    with pytest.raises(ValueError, match='truncated'):
        sgp_write(Sgp40Harness().dev, 0x36)
    with pytest.raises(ValueError, match='no arguments'):
        sgp_write(Sgp40Harness().dev, 0x28, 0x0E, 0x00)


def test_sgp40_raises_on_a_raw_value_outside_16_bits():
    with pytest.raises(ValueError, match=r'0\.\.65535'):
        sgp_write(Sgp40Harness(70000).dev, *sgp_measure_command(25, 50))
    with pytest.raises(ValueError, match=r'0\.\.65535'):
        sgp_write(Sgp40Harness(-1).dev, *sgp_measure_command(25, 50))


class TestSGP40Slave(unittest.TestCase):
    """Command words, CRC-checked replies, and command durations on an injected clock."""

    def setUp(self):
        self.ns = 0
        self.slave = SGP40Slave(lambda: self.ns)

    def advance(self, ms: float) -> None:
        self.ns += int(ms * 1_000_000)

    def write(self, *data: int) -> None:
        self.slave.handle_event(I2C_START_SEND)
        for byte in data:
            self.slave.handle_event(write_event(byte))
        self.slave.handle_event(I2C_FINISH)

    def read(self, n: int, start: bool = True) -> list[int]:
        if start:
            self.slave.handle_event(I2C_START_RECV)
        out = [self.slave.handle_event(I2C_READ) for _ in range(n)]
        self.slave.handle_event(I2C_FINISH)
        return out

    @staticmethod
    def words(data: list[int]) -> list:
        out = []
        for i in range(0, len(data), 3):
            msb, lsb, crc = data[i:i + 3]
            out.append((msb << 8) | lsb if sensirion_crc8(bytes([msb, lsb])) == crc else None)
        return out

    @staticmethod
    def measure_command(temperature: float = 25, humidity: float = 50) -> list[int]:
        rh = int(humidity * 65535 / 100 + 0.5).to_bytes(2, 'big')
        t = int((temperature + 45) * 65535 / 175).to_bytes(2, 'big')
        return [0x26, 0x0F, *rh, sensirion_crc8(rh), *t, sensirion_crc8(t)]

    def measure(self, wait_ms: float = 30) -> list:
        self.write(*self.measure_command())
        self.advance(wait_ms)
        return self.words(self.read(3))

    def test_crc_matches_the_datasheet_check_value(self):
        self.assertEqual(sensirion_crc8(b'\xBE\xEF'), 0x92)
        self.assertEqual(sensirion_crc8(b'\x80\x00'), 0xA2)
        self.assertEqual(sensirion_crc8(b'\x66\x66'), 0x93)

    def test_address(self):
        self.assertEqual(self.slave.addr, 0x59)

    def test_zero_length_probe_leaves_state_untouched(self):
        self.write()
        self.assertEqual(self.measure(), [30000])

    def test_serial_number_is_three_checked_words_at_once(self):
        self.write(0x36, 0x82)
        self.assertEqual(self.words(self.read(9)), [0x0000, 0x1234, 0x5678])

    def test_featureset(self):
        self.write(0x20, 0x2F)
        self.assertEqual(self.words(self.read(3)), [0x0020])

    def test_self_test_passes_after_320_ms(self):
        self.write(0x28, 0x0E)
        self.advance(320)
        self.assertEqual(self.words(self.read(3)), [0xD400])

    def test_self_test_read_at_250_ms_fails_the_crc(self):
        self.write(0x28, 0x0E)
        self.advance(250)
        self.assertEqual(self.read(3), [0xFF, 0xFF, 0xFF])

    def test_measure_returns_the_driven_raw_value(self):
        self.assertEqual(self.measure(), [30000])
        self.slave.update(41234)
        self.assertEqual(self.measure(), [41234])

    def test_raw_is_latched_when_the_command_executes(self):
        self.write(*self.measure_command())
        self.slave.update(100)
        self.advance(30)
        self.assertEqual(self.words(self.read(3)), [30000])

    def test_full_scale_and_zero(self):
        self.slave.update(0xFFFF)
        self.assertEqual(self.measure(), [0xFFFF])
        self.slave.update(0)
        self.assertEqual(self.measure(), [0])

    def test_half_ticks_round_up(self):
        self.slave.update(1234.5)
        self.assertEqual(self.measure(), [1235])

    def test_read_without_a_start_event_is_served(self):
        self.write(*self.measure_command())
        self.advance(30)
        self.assertEqual(self.words(self.read(3, start=False)), [30000])

    def test_early_read_returns_ff_and_keeps_the_result(self):
        self.write(*self.measure_command())
        self.advance(24)
        self.assertEqual(self.read(3), [0xFF, 0xFF, 0xFF])
        self.advance(1)
        self.assertEqual(self.words(self.read(3)), [30000])

    def test_reading_past_the_reply_returns_ff(self):
        self.write(*self.measure_command())
        self.advance(30)
        data = self.read(5)
        self.assertEqual(self.words(data[:3]), [30000])
        self.assertEqual(data[3:], [0xFF, 0xFF])

    def test_a_second_read_transfer_finds_nothing(self):
        self.assertEqual(self.measure(), [30000])
        self.assertEqual(self.read(3), [0xFF, 0xFF, 0xFF])

    def test_a_repeated_start_read_gets_the_serial_number(self):
        # A repeated START reaches the slave as FINISH + START_RECV.
        self.write(0x36, 0x82)
        self.assertEqual(self.words(self.read(9)), [0x0000, 0x1234, 0x5678])

    def test_compensation_words_do_not_scale_raw(self):
        self.write(*self.measure_command(temperature=30, humidity=80))
        self.advance(30)
        self.assertEqual(self.words(self.read(3)), [30000])

    def test_zephyr_driver_default_compensation_bytes(self):
        # sgp40_attr_set: t_ticks = ((25 + 45) * 65535 + 87) / 175, rh_ticks = (50 * 65535 + 50) / 100
        t = (((25 + 45) * 65535 + 87) // 175).to_bytes(2, 'big')
        rh = ((50 * 65535 + 50) // 100).to_bytes(2, 'big')
        self.write(0x26, 0x0F, *rh, sensirion_crc8(rh), *t, sensirion_crc8(t))
        self.advance(30)
        self.assertEqual(self.words(self.read(3)), [30000])

    def test_bad_compensation_crc_raises(self):
        command = self.measure_command()
        command[4] ^= 0x01
        with self.assertRaises(ValueError):
            self.write(*command)

    def test_measure_without_compensation_words_raises(self):
        with self.assertRaises(ValueError):
            self.write(0x26, 0x0F)

    def test_heater_off_and_soft_reset_take_no_reply_and_a_measurement_follows(self):
        for command in ((0x36, 0x15), (0x00, 0x06)):
            self.write(*command)
            self.assertEqual(self.read(3), [0xFF, 0xFF, 0xFF])
            self.assertEqual(self.measure(), [30000])

    def test_unsupported_traffic_raises(self):
        for command in ((0x12, 0x34), (0x26,), (0x36, 0x82, 0x00)):
            with self.assertRaises(ValueError):
                self.write(*command)

    def test_out_of_range_raw_raises_at_the_next_measurement(self):
        for raw in (-1, 0x10000, float('nan')):
            self.slave.update(raw)
            with self.assertRaises(ValueError):
                self.write(*self.measure_command())


def test_sgp40_rejects_an_unknown_i2c_event():
    with pytest.raises(ValueError, match='sgp40: unsupported I2C event 0x02'):
        SGP40Slave(lambda: 0).handle_event(0x02)
