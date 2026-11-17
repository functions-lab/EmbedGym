"""Unit tests for embedgym_parts/i2c/mlx90614.py (MLX90614Slave) over the picsimlab I2C
event encoding."""
from __future__ import annotations

import pytest

from embedgym_parts.i2c.mlx90614 import MLX90614Slave, pec
from embedgym_parts.i2c.protocol import I2C_FINISH, I2C_NACK, I2C_READ, I2C_START_RECV, I2C_START_SEND
from i2c_bus import MS_NS, i2c_read_seq, write_event

SA_W, SA_R = 0x5A << 1, (0x5A << 1) | 1


class Clock:
    def __init__(self) -> None:
        self.now = 0

    def __call__(self) -> int:
        return self.now


def powered(at_ms: float = 300) -> tuple[MLX90614Slave, Clock]:
    clock = Clock()
    dev = MLX90614Slave(clock)
    dev.power_on()
    clock.now = round(at_ms * MS_NS)
    return dev, clock


def read_word(dev, command: int) -> tuple[int, int]:
    """SMBus Read Word: (word, PEC)."""
    lsb, msb, crc = i2c_read_seq(dev, command, 3)
    return lsb | (msb << 8), crc


def write_word(dev, command: int, word: int, crc: int | None = None) -> list[int]:
    """SMBus Write Word with PEC; the ACK (0) or NACK of each byte."""
    lsb, msb = word & 0xFF, word >> 8
    if crc is None:
        crc = pec([SA_W, command, lsb, msb])
    acks = [dev.handle_event(I2C_START_SEND)]
    acks += [dev.handle_event(write_event(byte)) for byte in (command, lsb, msb, crc)]
    dev.handle_event(I2C_FINISH)
    return acks


def celsius(word: int) -> float:
    return round(word * 0.02 - 273.15, 2)


def test_pec_matches_the_datasheet_examples():
    assert pec([SA_W, 0x07, SA_R, 0xD2, 0x3A]) == 0x30
    assert pec([SA_W, 0x22, 0x07, 0xC8]) == 0x48
    assert pec([SA_W, 0xFF]) == 0xE8


def test_reads_ta_and_tobj1_with_pec():
    dev, _ = powered()
    dev.update({'objectTemperature': 28.75, 'ambientTemperature': 21.5}, 0)
    word, crc = read_word(dev, 0x07)
    assert word == 0x3AF7 and celsius(word) == 28.75
    assert crc == pec([SA_W, 0x07, SA_R, word & 0xFF, word >> 8])
    word, crc = read_word(dev, 0x06)
    assert celsius(word) == 21.51
    assert crc == pec([SA_W, 0x06, SA_R, word & 0xFF, word >> 8])


def test_temperature_limits_and_ta_linearization_floor():
    dev, _ = powered()
    dev.update({'objectTemperature': -70, 'ambientTemperature': -40}, 0)
    assert read_word(dev, 0x07)[0] == 0x27AE
    assert read_word(dev, 0x06)[0] == 0x2DE4
    dev.update({'objectTemperature': 380, 'ambientTemperature': 125}, 0)
    assert celsius(read_word(dev, 0x07)[0]) == 380.01
    assert read_word(dev, 0x06)[0] == 0x4DC4
    for key, value in (('objectTemperature', 380.5), ('ambientTemperature', -41), ('objectTemperature', True)):
        with pytest.raises(ValueError, match=f'mlx90614: {key} must be a number'):
            dev.update({key: value}, 0)
    with pytest.raises(ValueError, match="no property 'temperature'"):
        dev.update({'temperature': 20}, 0)


def test_first_result_is_at_250_ms_after_power_on_and_refresh_every_93_ms():
    dev, clock = powered(0.4)
    assert celsius(read_word(dev, 0x07)[0]) == 25.01
    dev.update({'objectTemperature': 30}, 100 * MS_NS)
    clock.now = round(249.9 * MS_NS)
    assert celsius(read_word(dev, 0x07)[0]) == 30.01
    dev, clock = powered(250)
    assert celsius(read_word(dev, 0x07)[0]) == 25.01
    dev.update({'objectTemperature': 40}, 300 * MS_NS)
    clock.now = 342 * MS_NS
    assert celsius(read_word(dev, 0x07)[0]) == 25.01
    clock.now = 343 * MS_NS
    assert celsius(read_word(dev, 0x07)[0]) == 40.01
    assert celsius(read_word(dev, 0x06)[0]) == 25.01


def test_read_works_across_a_stop_and_returns_ff_past_the_pec():
    dev, _ = powered()
    assert dev.handle_event(I2C_START_SEND) == 0
    assert dev.handle_event(write_event(0x07)) == 0
    dev.handle_event(I2C_FINISH)
    assert dev.handle_event(I2C_START_RECV) == 0
    data = [dev.handle_event(I2C_READ) for _ in range(4)]
    dev.handle_event(I2C_NACK)
    dev.handle_event(I2C_FINISH)
    assert data == [0x3C, 0x3A, pec([SA_W, 0x07, SA_R, 0x3C, 0x3A]), 0xFF]


def test_address_probe_is_acknowledged():
    dev, _ = powered()
    assert dev.handle_event(I2C_START_SEND) == 0
    dev.handle_event(I2C_FINISH)


def test_eeprom_reads_factory_cells():
    dev, _ = powered()
    assert read_word(dev, 0x24)[0] == 0xFFFF
    assert read_word(dev, 0x2E)[0] & 0xFF == 0x5A
    assert read_word(dev, 0x25)[0] & 0x0040 == 0
    word, crc = read_word(dev, 0x22)
    assert word & 0x0002 == 0 and crc == pec([SA_W, 0x22, SA_R, word & 0xFF, word >> 8])
    with pytest.raises(ValueError, match='Melexis-reserved calibration data'):
        read_word(dev, 0x2F)


def test_eeprom_write_erases_then_writes_with_5_ms_busy():
    dev, clock = powered()
    assert write_word(dev, 0x24, 0x0000) == [0, 0, 0, 0, 0]
    assert read_word(dev, 0xF0)[0] == 0x0090
    with pytest.raises(ValueError, match='still busy'):
        read_word(dev, 0x24)
    with pytest.raises(ValueError, match='still busy'):
        write_word(dev, 0x24, 0xF332)
    clock.now += 5 * MS_NS
    assert read_word(dev, 0xF0)[0] == 0x0010
    assert read_word(dev, 0x24)[0] == 0x0000
    assert write_word(dev, 0x24, 0xF332) == [0, 0, 0, 0, 0]
    clock.now += 5 * MS_NS
    assert read_word(dev, 0x24)[0] == 0xF332
    clock.now += 5 * MS_NS
    with pytest.raises(ValueError, match='must be erased'):
        write_word(dev, 0x24, 0xFFFF)


def test_eeprom_changes_wait_for_power_up():
    dev, clock = powered()
    write_word(dev, 0x2E, 0x0000)
    clock.now += 10 * MS_NS
    write_word(dev, 0x2E, 0xBE5B)
    clock.now += 10 * MS_NS
    assert dev.addr == 0x5A
    assert read_word(dev, 0x2E)[0] == 0xBE5B


def test_wrong_write_pec_is_nacked_and_discarded():
    dev, clock = powered()
    assert write_word(dev, 0x24, 0x0000, crc=0x00)[-1] == 1
    clock.now += 10 * MS_NS
    assert read_word(dev, 0x24)[0] == 0xFFFF


@pytest.mark.parametrize('command,word,message', [
    (0x07, 0x0000, 'RAM is read-only'),
    (0xF0, 0x0000, 'flags .* are read-only'),
    (0x26, 0x0000, 'not customer-writable'),
    (0x2F, 0x0000, 'not customer-writable'),
])
def test_rejected_writes(command, word, message):
    dev, _ = powered()
    with pytest.raises(ValueError, match=message):
        write_word(dev, command, word)


def test_enabling_pwm_and_altering_calibration_bits_are_rejected():
    dev, clock = powered()
    write_word(dev, 0x22, 0x0000)
    clock.now += 10 * MS_NS
    with pytest.raises(ValueError, match='enabling PWM mode'):
        write_word(dev, 0x22, 0x0203)
    write_word(dev, 0x25, 0x0000)
    clock.now += 10 * MS_NS
    with pytest.raises(ValueError, match='factory-calibration bits or the sensor count'):
        write_word(dev, 0x25, 0x9FF4)
    write_word(dev, 0x25, 0x9FB5)   # IIR 80%: a filter setting, not calibration
    clock.now += 10 * MS_NS
    assert read_word(dev, 0x25)[0] == 0x9FB5


@pytest.mark.parametrize('command,message', [
    (0xFF, 'sleep mode'),
    (0x40, 'command 0x40 is not supported'),
    (0xF1, 'command 0xf1 is not supported'),
])
def test_rejected_commands(command, message):
    dev, _ = powered()
    dev.handle_event(I2C_START_SEND)
    with pytest.raises(ValueError, match=message):
        dev.handle_event(write_event(command))


@pytest.mark.parametrize('command,message', [
    (0x08, r'\(TOBJ2\) has no second IR sensor'),
    (0x04, 'raw IR data is not modeled'),
    (0x05, 'raw IR data is not modeled'),
    (0x00, 'Melexis-reserved'),
    (0x09, 'Melexis-reserved'),
])
def test_rejected_ram_reads(command, message):
    dev, _ = powered()
    with pytest.raises(ValueError, match=message):
        read_word(dev, command)


def test_read_without_command_and_short_write_are_rejected():
    dev, _ = powered()
    with pytest.raises(ValueError, match='only SMBus Read Word'):
        dev.handle_event(I2C_START_RECV)
    dev.handle_event(I2C_START_SEND)
    dev.handle_event(write_event(0x24))
    dev.handle_event(write_event(0x00))
    with pytest.raises(ValueError, match='ended before its PEC'):
        dev.handle_event(I2C_FINISH)
