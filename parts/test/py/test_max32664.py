"""Unit tests for embedgym_parts/i2c/max32664.py (MAX32664Slave): the frontend-mirroring cases
over the picsimlab I2C event encoding, then the register-level cases. The byte
literals match frontend/src/__tests__/max32664-protocol.test.ts."""
from __future__ import annotations

import unittest

import pytest

from esp32_i2c_slaves import I2C_FINISH, I2C_READ, I2C_START_RECV, I2C_START_SEND
from embedgym_parts.i2c.js_math import i32
from embedgym_parts.i2c.max32664 import MAX32664Slave
from i2c_bus import int8, write_event


# ─── MAX32664 (max32664-protocol.test.ts) ─────────────────────────────────────
# The byte sequences are SparkFun_Bio_Sensor_Hub_Library.cpp's: a command is one
# write transaction; its reply — status byte first — is a separate read.


def hub_write(dev, *data: int) -> None:
    assert dev.handle_event(I2C_START_SEND) == 0
    for b in data:
        assert dev.handle_event(write_event(b)) == 0
    dev.handle_event(I2C_FINISH)


def hub_read(dev, n: int) -> list[int]:
    assert dev.handle_event(I2C_START_RECV) == 0
    out = [dev.handle_event(I2C_READ) for _ in range(n)]
    dev.handle_event(I2C_FINISH)
    return out


def hub_command(dev, *data: int) -> int:
    """writeByte() / enableWrite(): command, then the lone status byte."""
    hub_write(dev, *data)
    return hub_read(dev, 1)[0]


def hub_read_one(dev, *data: int) -> int:
    """readByte(): command, then [status, value]."""
    hub_write(dev, *data)
    status, value = hub_read(dev, 2)
    assert status == 0x00
    return value


def hub_read_array(dev, n: int, *data: int) -> list[int]:
    """readFillArray(): command, then [status, d0..dN-1]."""
    hub_write(dev, *data)
    reply = hub_read(dev, n + 1)
    assert reply[0] == 0x00
    return reply[1:]


def hub_begin(dev, mfio_high: bool = True) -> None:
    """The reset pulse begin() drives, as the worker reports its edges."""
    dev.set_reset_pin(False, mfio_high)
    dev.set_reset_pin(True, mfio_high)


def hub_config_bpm(dev, mode: int) -> None:
    assert hub_command(dev, 0x10, 0x00, 0x02) == 0   # setOutputMode(ALGO_DATA)
    assert hub_command(dev, 0x10, 0x01, 0x01) == 0   # setFifoThreshold(1)
    assert hub_command(dev, 0x52, 0x00, 0x01) == 0   # agcAlgoControl(ENABLE)
    assert hub_command(dev, 0x44, 0x03, 0x01) == 0   # max30101Control(ENABLE)
    assert hub_command(dev, 0x52, 0x02, mode) == 0   # maximFastAlgoControl(mode)
    hub_read_one(dev, 0x51, 0x00, 0x03)              # readAlgoSamples()


def hub_read_bpm(dev, n: int) -> list[int]:
    assert hub_read_one(dev, 0x00, 0x00) == 0x08     # readSensorHubStatus(): no error, DataRdyInt
    hub_read_one(dev, 0x12, 0x00)                    # numSamplesOutFifo()
    return hub_read_array(dev, n, 0x12, 0x01)        # readFillArray(READ_DATA)


def hub_fifo(dev, n: int) -> tuple[list[int], list[int]]:
    """The two FIFO reads, raw: [status, count] and READ_DATA's reply of 1 + n bytes."""
    hub_write(dev, 0x12, 0x00)
    count = hub_read(dev, 2)
    hub_write(dev, 0x12, 0x01)
    return count, hub_read(dev, n + 1)


# The algorithm block of the default reading: 72 BPM, 95 %, 98 %, status 3, R 12.5, ext 0.
MODE_ONE_BLOCK = [0x02, 0xD0, 95, 0x03, 0xD4, 3]
MODE_TWO_BLOCK = [*MODE_ONE_BLOCK, 0x00, 0x7D, 0x00, 0x00, 0x00]
# IR 223811, red 197778, LED3 0, LED4 0 as four 24-bit big-endian words.
LED_BLOCK = [0x03, 0x6A, 0x43, 0x03, 0x04, 0x92, 0, 0, 0, 0, 0, 0]
EMPTY_FIFO = ([0x00, 0x00], [0xFE, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])


def hub_config_sensor(dev, fmt: int, mode: int) -> None:
    """configSensor() / configSensorBpm(mode), byte for byte."""
    assert hub_command(dev, 0x10, 0x00, fmt) == 0
    assert hub_command(dev, 0x10, 0x01, 0x01) == 0
    assert hub_command(dev, 0x44, 0x03, 0x01) == 0
    assert hub_command(dev, 0x52, 0x02, mode) == 0


def hub_decode(block: list[int]) -> dict:
    """readBpm()'s decoding: heart rate and SpO2 are /10 into a uint16_t."""
    out = {
        'heartRate': ((block[0] << 8) | block[1]) // 10,
        'confidence': block[2],
        'oxygen': ((block[3] << 8) | block[4]) // 10,
        'status': block[5],
    }
    if len(block) > 6:
        out['rValue'] = ((block[6] << 8) | block[7]) / 10.0
        out['extStatus'] = int8(block[8])
    return out


def test_max32664_reports_application_mode_after_the_reset_pulse_with_mfio_high():
    dev = MAX32664Slave()
    hub_begin(dev)
    hub_write(dev, 0x02, 0x00)
    assert hub_read(dev, 2) == [0x00, 0x00]


def test_max32664_answers_in_application_mode_without_a_reset():
    dev = MAX32664Slave()
    assert hub_read_one(dev, 0x02, 0x00) == 0x00
    hub_config_bpm(dev, 0x01)
    assert hub_read_bpm(dev, 6) == MODE_ONE_BLOCK


def test_max32664_selects_bootloader_mode_when_mfio_is_low_at_the_release():
    dev = MAX32664Slave()
    hub_begin(dev, mfio_high=False)
    assert hub_read_one(dev, 0x02, 0x00) == 0x08


def test_max32664_ignores_a_release_never_preceded_by_an_assert_and_repeated_edges():
    dev = MAX32664Slave()
    hub_config_bpm(dev, 0x01)
    dev.set_reset_pin(True, False)
    assert hub_read_one(dev, 0x02, 0x00) == 0x00
    assert dev.sensor_enabled
    # The worker reports every write; a held-low RST is one assert.
    dev.set_reset_pin(False, False)
    dev.set_reset_pin(False, False)
    dev.set_reset_pin(True, False)
    assert hub_read_one(dev, 0x02, 0x00) == 0x08
    dev.set_reset_pin(True, True)    # a second high with no assert changes nothing
    assert hub_read_one(dev, 0x02, 0x00) == 0x08


def test_max32664_a_reset_restores_every_hub_setting_but_not_the_max30101_registers():
    dev = MAX32664Slave()
    hub_config_bpm(dev, 0x02)
    assert hub_command(dev, 0x10, 0x00, 0x03) == 0
    assert hub_command(dev, 0x50, 0x00, 0x00, 60) == 0
    assert hub_command(dev, 0x40, 0x03, 0x0A, 0x6F) == 0
    hub_begin(dev)
    assert hub_read_one(dev, 0x11, 0x00) == 0x02
    assert hub_read_one(dev, 0x45, 0x03) == 0x00
    assert hub_read_one(dev, 0x51, 0x00, 0x00) == 0x0C
    assert (dev.algorithm_mode, dev.agc_enabled) == (0, False)
    assert hub_fifo(dev, 6) == EMPTY_FIFO
    assert hub_read_one(dev, 0x41, 0x03, 0x0A) == 0x6F


def test_max32664_device_reset_and_bootloader_entry_restore_the_hub_settings():
    dev = MAX32664Slave()
    hub_config_bpm(dev, 0x01)
    assert hub_command(dev, 0x01, 0x00, 0x02) == 0
    assert hub_read_one(dev, 0x45, 0x03) == 0x00
    hub_config_bpm(dev, 0x01)
    assert hub_command(dev, 0x01, 0x00, 0x08) == 0
    assert hub_read_one(dev, 0x02, 0x00) == 0x08
    assert hub_command(dev, 0x01, 0x00, 0x00) == 0
    assert hub_read_one(dev, 0x02, 0x00) == 0x00
    assert hub_read_one(dev, 0x45, 0x03) == 0x00


def test_max32664_exit_bootloader_in_application_mode_keeps_the_settings():
    dev = MAX32664Slave()
    hub_config_bpm(dev, 0x01)
    assert hub_command(dev, 0x01, 0x00, 0x00) == 0
    assert hub_read_bpm(dev, 6) == MODE_ONE_BLOCK


@pytest.mark.parametrize('cmd', [
    (0x00, 0x00), (0x10, 0x00, 0x03), (0x12, 0x00), (0x12, 0x01), (0x44, 0x03, 0x01), (0x52, 0x02, 0x01),
])
def test_max32664_bootloader_answers_application_families_with_err_unavail_cmd(cmd):
    dev = MAX32664Slave()
    hub_begin(dev, mfio_high=False)
    hub_write(dev, *cmd)
    assert hub_read(dev, 2) == [0x01, 0xFF]
    assert hub_read_one(dev, 0xFF, 0x00, 0x00) == 0x01
    assert (dev.sensor_enabled, dev.output_mode, dev.algorithm_mode) == (False, 0x02, 0)


def test_max32664_config_bpm_mode_one_records_every_setting():
    dev = MAX32664Slave()
    hub_begin(dev)
    hub_config_bpm(dev, 0x01)
    assert dev.algorithm_mode == 0x01
    assert dev.output_mode == 0x02
    assert dev.sensor_enabled and dev.agc_enabled
    assert dev.fifo_threshold == 0x01


def test_max32664_config_bpm_rejects_an_undefined_algorithm_mode():
    dev = MAX32664Slave()
    hub_begin(dev)
    hub_config_bpm(dev, 0x02)
    assert dev.algorithm_mode == 0x02
    with pytest.raises(ValueError, match='WHRM algorithm mode'):
        hub_write(dev, 0x52, 0x02, 0x03)


@pytest.mark.parametrize('cmd, match', [
    ((0x44, 0x03, 0x02), 'takes 0 or 1'),
    ((0x52, 0x00, 0x02), 'takes 0 or 1'),
    ((0x10, 0x01, 0x00), r'threshold must be 1\.\.255'),
    ((0x44, 0x04, 0x01), 'no accelerometer'),
])
def test_max32664_rejects_undefined_enable_bytes_threshold_zero_and_the_accelerometer(cmd, match):
    dev = MAX32664Slave()
    with pytest.raises(ValueError, match=match):
        hub_write(dev, *cmd)


def test_max32664_mode_one_block_decodes_the_default_reading_and_tracks_an_update():
    dev = MAX32664Slave()
    hub_begin(dev)
    hub_config_bpm(dev, 0x01)
    block = hub_read_bpm(dev, 6)
    assert block == MODE_ONE_BLOCK
    assert hub_decode(block) == {'heartRate': 72, 'confidence': 95, 'oxygen': 98, 'status': 3}
    dev.update(heartRate=128, oxygen=91, confidence=60, status=1)
    assert hub_decode(hub_read_bpm(dev, 6)) == {'heartRate': 128, 'confidence': 60, 'oxygen': 91, 'status': 1}


def test_max32664_mode_two_block_adds_r_value_and_signed_extended_status():
    dev = MAX32664Slave()
    dev.update(rValue=18.4, extStatus=-2)
    hub_begin(dev)
    hub_config_bpm(dev, 0x02)
    block = hub_read_bpm(dev, 11)
    assert len(block) == 11
    decoded = hub_decode(block)
    assert decoded['heartRate'] == 72 and decoded['status'] == 3
    assert decoded['rValue'] == pytest.approx(18.4)
    assert decoded['extStatus'] == -2
    assert block[9:] == [0, 0]


def test_max32664_selftest_drives_zero_reading_encodes_as_zeros():
    dev = MAX32664Slave()
    hub_begin(dev)
    hub_config_bpm(dev, 0x02)
    dev.update(heartRate=0, oxygen=0, status=0)
    decoded = hub_decode(hub_read_bpm(dev, 11))
    assert (decoded['heartRate'], decoded['oxygen'], decoded['status']) == (0, 0, 0)
    assert decoded['rValue'] == pytest.approx(12.5)


def test_max32664_hub_status_is_clean_so_read_bpm_never_takes_the_error_path():
    dev = MAX32664Slave()
    hub_begin(dev)
    assert hub_read_one(dev, 0x00, 0x00) & 0x01 == 0


def test_max32664_data_rdy_int_is_set_only_while_a_sample_meets_the_threshold():
    dev = MAX32664Slave()
    assert hub_read_one(dev, 0x00, 0x00) == 0x00
    hub_config_bpm(dev, 0x01)
    assert hub_read_one(dev, 0x00, 0x00) == 0x08
    assert hub_command(dev, 0x10, 0x01, 0x0F) == 0
    assert hub_read_one(dev, 0x00, 0x00) == 0x00


def test_max32664_sensor_data_serves_read_sensor_12_bytes_of_led_words():
    dev = MAX32664Slave()
    hub_begin(dev)
    hub_config_sensor(dev, 0x01, 0x01)
    assert hub_fifo(dev, 12) == ([0x00, 0x01], [0x00, *LED_BLOCK])
    # readSensor(): LED1 is IR, LED2 is red.
    assert (LED_BLOCK[0] << 16) | (LED_BLOCK[1] << 8) | LED_BLOCK[2] == 223811
    assert (LED_BLOCK[3] << 16) | (LED_BLOCK[4] << 8) | LED_BLOCK[5] == 197778


def test_max32664_sensor_data_needs_only_the_max30101():
    dev = MAX32664Slave()
    hub_config_sensor(dev, 0x01, 0x00)
    assert hub_read_array(dev, 12, 0x12, 0x01) == LED_BLOCK


def test_max32664_sensor_and_algorithm_mode_one_is_led_words_then_the_algorithm_block():
    dev = MAX32664Slave()
    hub_config_sensor(dev, 0x03, 0x01)
    assert hub_read_array(dev, 18, 0x12, 0x01) == [*LED_BLOCK, *MODE_ONE_BLOCK]


def test_max32664_sensor_and_algorithm_mode_two_serves_read_sensor_bpm_23_bytes():
    dev = MAX32664Slave()
    hub_config_sensor(dev, 0x03, 0x02)
    assert hub_read_array(dev, 24, 0x12, 0x01) == [*LED_BLOCK, *MODE_TWO_BLOCK, 0xFF]


def test_max32664_the_algorithm_block_tracks_the_reading_behind_the_led_words():
    dev = MAX32664Slave()
    hub_config_sensor(dev, 0x03, 0x01)
    dev.update(heartRate=128, oxygen=91)
    d = hub_read_array(dev, 18, 0x12, 0x01)
    assert (((d[12] << 8) | d[13]) // 10, ((d[15] << 8) | d[16]) // 10) == (128, 91)


def test_max32664_rejects_sample_counter_formats_at_set_format_and_keeps_the_format():
    dev = MAX32664Slave()
    hub_config_bpm(dev, 0x01)
    for fmt in (0x05, 0x06, 0x07):
        with pytest.raises(ValueError, match='sample-counter output format'):
            hub_write(dev, 0x10, 0x00, fmt)
    with pytest.raises(ValueError, match='out of range'):
        hub_write(dev, 0x10, 0x00, 0x08)
    assert hub_read_one(dev, 0x11, 0x00) == 0x02


def test_max32664_fifo_is_empty_before_the_max30101_is_enabled():
    dev = MAX32664Slave()
    assert hub_command(dev, 0x10, 0x00, 0x02) == 0
    assert hub_command(dev, 0x52, 0x02, 0x01) == 0
    assert hub_fifo(dev, 6) == EMPTY_FIFO
    assert hub_command(dev, 0x44, 0x03, 0x01) == 0
    assert hub_fifo(dev, 6) == ([0x00, 0x01], [0x00, *MODE_ONE_BLOCK])


def test_max32664_fifo_is_empty_while_whrm_is_off_for_the_algorithm_formats():
    dev = MAX32664Slave()
    assert hub_command(dev, 0x44, 0x03, 0x01) == 0
    for fmt in (0x02, 0x03):
        assert hub_command(dev, 0x10, 0x00, fmt) == 0
        assert hub_fifo(dev, 6) == EMPTY_FIFO
    hub_config_bpm(dev, 0x01)
    assert hub_command(dev, 0x52, 0x02, 0x00) == 0
    assert hub_fifo(dev, 6) == EMPTY_FIFO


@pytest.mark.parametrize('fmt', [0x00, 0x04])
def test_max32664_fifo_is_empty_while_the_output_format_is_a_pause(fmt):
    dev = MAX32664Slave()
    hub_config_bpm(dev, 0x01)
    assert hub_command(dev, 0x10, 0x00, fmt) == 0
    assert hub_fifo(dev, 6) == EMPTY_FIFO


def test_max32664_configuration_register_fields_round_trip_like_the_library():
    dev = MAX32664Slave()
    hub_begin(dev)
    reg = hub_read_one(dev, 0x41, 0x03, 0x0A)
    assert reg == 0x27
    # setPulseWidth(118): PULSE_MASK 0xFC | bits 1.
    assert hub_command(dev, 0x40, 0x03, 0x0A, (reg & 0xFC) | 1) == 0
    assert hub_read_one(dev, 0x41, 0x03, 0x0A) & 0x03 == 1
    # setSampleRate(400): SAMP_MASK 0xE3 | 3 << 2.
    reg = hub_read_one(dev, 0x41, 0x03, 0x0A)
    assert hub_command(dev, 0x40, 0x03, 0x0A, (reg & 0xE3) | (3 << 2)) == 0
    assert (hub_read_one(dev, 0x41, 0x03, 0x0A) & 0x1C) >> 2 == 3
    # setAdcRange(16384): ADC_MASK 0x9F | 3 << 5.
    reg = hub_read_one(dev, 0x41, 0x03, 0x0A)
    assert hub_command(dev, 0x40, 0x03, 0x0A, (reg & 0x9F) | (3 << 5)) == 0
    assert (hub_read_one(dev, 0x41, 0x03, 0x0A) & 0x60) >> 5 == 3


def test_max32664_serves_part_id_revision_dump_and_afe_attributes():
    dev = MAX32664Slave()
    hub_begin(dev)
    assert hub_read_one(dev, 0x41, 0x03, 0xFF) == 0x15
    assert hub_read_one(dev, 0x41, 0x03, 0xFE) == 0x01
    assert len(hub_read_array(dev, 36, 0x43, 0x03)) == 36
    assert hub_read_array(dev, 2, 0x42, 0x03) == [3, 36]
    assert hub_read_array(dev, 2, 0x42, 0x04) == [1, 0]


def test_max32664_raises_on_a_register_outside_the_file_and_on_the_accelerometer():
    dev = MAX32664Slave()
    hub_begin(dev)
    with pytest.raises(ValueError, match='out of range'):
        hub_write(dev, 0x41, 0x03, 0x40)
    with pytest.raises(ValueError, match='no accelerometer'):
        hub_write(dev, 0x41, 0x04, 0x00)
    with pytest.raises(ValueError, match='no accelerometer'):
        hub_write(dev, 0x43, 0x04)


def test_max32664_agc_configuration_round_trips():
    dev = MAX32664Slave()
    hub_begin(dev)
    for cfg_id, value in ((0x00, 60), (0x01, 12), (0x02, 30), (0x03, 4)):
        assert hub_command(dev, 0x50, 0x00, cfg_id, value) == 0
    assert [hub_read_one(dev, 0x51, 0x00, i) for i in range(4)] == [60, 12, 30, 4]
    with pytest.raises(ValueError, match='AGC config id'):
        hub_write(dev, 0x50, 0x00, 0x04, 1)


def test_max32664_spo2_coefficients_round_trip_signed():
    dev = MAX32664Slave()
    hub_begin(dev)
    coefs = [159584, -3465966, 11268987]
    payload = [b for c in coefs for b in ((c >> 24) & 0xFF, (c >> 16) & 0xFF, (c >> 8) & 0xFF, c & 0xFF)]
    assert hub_command(dev, 0x50, 0x02, 0x0B, *payload) == 0
    back = hub_read_array(dev, 12, 0x51, 0x02, 0x0B)
    decoded = [i32((back[o] << 24) | (back[o + 1] << 16) | (back[o + 2] << 8) | back[o + 3])
               for o in (0, 4, 8)]
    assert decoded == coefs


def test_max32664_identity_versions_sensor_mode_output_mode_and_device_reset():
    dev = MAX32664Slave()
    hub_begin(dev)
    # 0x01 is the MAX32660/MAX32664; the library's getMcuType() turns it into 255.
    assert hub_read_one(dev, 0xFF, 0x00, 0x00) == 0x01
    assert hub_read_array(dev, 3, 0xFF, 0x03) == [10, 1, 0]
    assert hub_read_array(dev, 3, 0xFF, 0x07) == [10, 1, 0]
    assert hub_read_one(dev, 0x45, 0x03) == 0x00
    assert hub_command(dev, 0x44, 0x03, 0x01) == 0
    assert hub_read_one(dev, 0x45, 0x03) == 0x01
    assert hub_command(dev, 0x44, 0x04, 0x00) == 0
    assert hub_read_one(dev, 0x45, 0x04) == 0x00
    assert hub_command(dev, 0x10, 0x00, 0x02) == 0
    assert hub_read_one(dev, 0x11, 0x00) == 0x02
    assert hub_command(dev, 0x01, 0x00, 0x02) == 0    # SFE_BIO_RESET
    assert hub_read_one(dev, 0x02, 0x00) == 0x00


@pytest.mark.parametrize('data, match', [
    ([0x80, 0x02, 0x01], 'bootloader'),
    ([0x81, 0x00], 'bootloader'),
    ([0x50, 0x04, 0x00, 0x01], 'blood-pressure'),
    ([0x77, 0x00], 'unsupported family'),
    ([0x12], 'truncated'),
    ([0x10, 0x00, 0x02, 0x02], 'argument'),
])
def test_max32664_unsupported_commands_raise_at_the_stop(data, match):
    dev = MAX32664Slave()
    with pytest.raises(ValueError, match=match):
        hub_write(dev, *data)


@pytest.mark.parametrize('family', [0x00, 0x11])
@pytest.mark.parametrize('index', [0x01, 0xFF])
def test_max32664_rejects_unsupported_status_and_output_mode_indexes_at_stop(family, index):
    dev = MAX32664Slave()
    with pytest.raises(ValueError, match='index .* is not supported'):
        hub_write(dev, family, index)


def test_max32664_bus_probe_over_read_and_reply_replacement():
    dev = MAX32664Slave()
    hub_begin(dev)
    hub_config_bpm(dev, 0x01)
    # Address probe: I2C_START_SEND, no bytes, STOP.
    assert dev.handle_event(I2C_START_SEND) == 0
    dev.handle_event(I2C_FINISH)
    assert dev.algorithm_mode == 0x01
    # Past the end of a reply reads 0xFF.
    hub_write(dev, 0x02, 0x00)
    assert hub_read(dev, 4) == [0x00, 0x00, 0xFF, 0xFF]
    # Two commands back to back: the second reply replaces the first.
    hub_write(dev, 0x10, 0x00, 0x02)
    hub_write(dev, 0x11, 0x00)
    assert hub_read(dev, 2) == [0x00, 0x02]


def test_max32664_repeated_start_serves_the_reply_of_the_write_it_follows():
    """i2c_master_write_read_device: write, then I2C_FINISH + I2C_START_RECV from QEMU's core."""
    dev = MAX32664Slave()
    hub_begin(dev)
    assert dev.handle_event(I2C_START_SEND) == 0
    assert dev.handle_event(write_event(0x02)) == 0
    assert dev.handle_event(write_event(0x00)) == 0
    dev.handle_event(I2C_FINISH)
    assert dev.handle_event(I2C_START_RECV) == 0
    assert [dev.handle_event(I2C_READ) for _ in range(2)] == [0x00, 0x00]
    dev.handle_event(I2C_FINISH)


def test_max32664_a_repeated_start_with_no_finish_ends_the_write_too():
    # The AVR and nRF buses send a repeated START with no FINISH before it.
    dev = MAX32664Slave()
    hub_begin(dev)
    assert dev.handle_event(I2C_START_SEND) == 0
    assert dev.handle_event(write_event(0x02)) == 0
    assert dev.handle_event(write_event(0x00)) == 0
    assert dev.handle_event(I2C_START_RECV) == 0
    assert [dev.handle_event(I2C_READ) for _ in range(2)] == [0x00, 0x00]
    dev.handle_event(I2C_FINISH)


def test_max32664_update_checks_every_value_before_applying_any():
    dev = MAX32664Slave()
    with pytest.raises(ValueError, match='heartRate must be in 0..511'):
        dev.update(oxygen=91, heartRate=600)
    assert dev.reading['oxygen'] == 98
    with pytest.raises(ValueError, match='irLed is a fixed LED count'):
        dev.update(irLed=5000)
    with pytest.raises(ValueError, match='unknown property "pulse"'):
        dev.update(pulse=5)
    with pytest.raises(ValueError, match='extStatus must be in -128..127'):
        dev.update(extStatus=200)
    with pytest.raises(ValueError, match='status must be in 0..3'):
        dev.update(status=float('nan'))
    dev.update(heartRate=55, oxygen=100)
    assert (dev.reading['heartRate'], dev.reading['oxygen']) == (55, 100)


class TestMAX32664Slave(unittest.TestCase):
    """The hub's command protocol, byte for byte as the SparkFun Bio Sensor Hub
    library issues it: a write transfer, a STOP, then a read transfer whose
    first byte is the status."""

    def setUp(self):
        self.slave = MAX32664Slave()

    def write(self, *data: int) -> None:
        self.slave.handle_event(I2C_START_SEND)
        for byte in data:
            self.slave.handle_event(write_event(byte))
        self.slave.handle_event(I2C_FINISH)

    def read(self, n: int) -> list[int]:
        self.slave.handle_event(I2C_START_RECV)
        out = [self.slave.handle_event(I2C_READ) for _ in range(n)]
        self.slave.handle_event(I2C_FINISH)
        return out

    def command(self, *data: int) -> int:
        self.write(*data)
        return self.read(1)[0]

    def read_array(self, n: int, *data: int) -> list[int]:
        self.write(*data)
        reply = self.read(n + 1)
        self.assertEqual(reply[0], 0x00)
        return reply[1:]

    def read_one(self, *data: int) -> int:
        return self.read_array(1, *data)[0]

    def begin(self, mfio_high: bool = True) -> None:
        self.slave.set_reset_pin(False, mfio_high)
        self.slave.set_reset_pin(True, mfio_high)

    def config_bpm(self, mode: int) -> None:
        for step in ((0x10, 0x00, 0x02), (0x10, 0x01, 0x01), (0x52, 0x00, 0x01), (0x44, 0x03, 0x01), (0x52, 0x02, mode)):
            self.assertEqual(self.command(*step), 0x00)
        self.read_one(0x51, 0x00, 0x03)

    def read_bpm(self, n: int) -> list[int]:
        self.assertEqual(self.read_one(0x00, 0x00), 0x08)
        self.read_one(0x12, 0x00)
        return self.read_array(n, 0x12, 0x01)

    def test_address(self):
        self.assertEqual(self.slave.addr, 0x55)

    def test_application_mode_after_a_reset_with_mfio_high(self):
        self.begin()
        self.assertEqual(self.read_one(0x02, 0x00), 0x00)

    def test_bootloader_mode_when_mfio_is_low_at_the_release(self):
        self.begin(mfio_high=False)
        self.assertEqual(self.read_one(0x02, 0x00), 0x08)

    def test_a_release_with_no_assert_before_it_is_ignored(self):
        self.slave.set_reset_pin(True, False)
        self.assertEqual(self.read_one(0x02, 0x00), 0x00)

    def test_answers_without_a_reset(self):
        self.config_bpm(0x01)
        self.assertEqual(len(self.read_bpm(6)), 6)

    def test_config_bpm_mode_one_records_every_step(self):
        self.begin()
        self.config_bpm(0x01)
        self.assertEqual(self.slave.algorithm_mode, 1)
        self.assertEqual(self.slave.output_mode, 0x02)
        self.assertTrue(self.slave.sensor_enabled)

    def test_an_undefined_algorithm_mode_raises(self):
        with self.assertRaisesRegex(ValueError, 'WHRM algorithm mode'):
            self.write(0x52, 0x02, 0x03)

    def test_mode_one_sample_is_six_bytes_of_the_default_reading(self):
        self.config_bpm(0x01)
        d = self.read_bpm(6)
        self.assertEqual(d, [0x02, 0xD0, 95, 0x03, 0xD4, 3])

    def test_mode_one_sample_ends_after_six_bytes(self):
        self.config_bpm(0x01)
        self.assertEqual(self.read_bpm(8)[6:], [0xFF, 0xFF])

    def test_a_driven_reading_shows_in_the_next_sample(self):
        self.config_bpm(0x01)
        self.read_bpm(6)
        self.slave.update(heartRate=128, oxygen=91, confidence=60, status=1)
        d = self.read_bpm(6)
        self.assertEqual(((d[0] << 8) | d[1], d[2], (d[3] << 8) | d[4], d[5]), (1280, 60, 910, 1))

    def test_mode_two_sample_adds_r_value_and_extended_status(self):
        self.slave.update(rValue=18.4, extStatus=-2)
        self.config_bpm(0x02)
        d = self.read_bpm(11)
        self.assertEqual(d[0:6], [0x02, 0xD0, 95, 0x03, 0xD4, 3])
        self.assertEqual((d[6] << 8) | d[7], 184)
        self.assertEqual(d[8], 0xFE)
        self.assertEqual(d[9:], [0, 0])

    def test_update_rejects_out_of_range_and_unknown_properties(self):
        for values in ({'heartRate': 512}, {'oxygen': 101}, {'status': 4}, {'extStatus': -129}, {'confidence': float('nan')}):
            with self.assertRaises(ValueError):
                self.slave.update(**values)
        with self.assertRaisesRegex(ValueError, 'unknown property'):
            self.slave.update(ir_led=1)

    def test_a_rejected_update_changes_nothing(self):
        with self.assertRaises(ValueError):
            self.slave.update(heart_rate=100, oxygen=101)
        self.config_bpm(0x01)
        self.assertEqual(self.read_bpm(6)[0:2], [0x02, 0xD0])

    def test_sensor_formats_serve_the_led_words_before_the_algorithm_block(self):
        for step in ((0x10, 0x00, 0x01), (0x44, 0x03, 0x01)):
            self.assertEqual(self.command(*step), 0x00)
        self.assertEqual(self.read_array(12, 0x12, 0x01), LED_BLOCK)
        for step in ((0x10, 0x00, 0x03), (0x52, 0x02, 0x02)):
            self.assertEqual(self.command(*step), 0x00)
        self.assertEqual(self.read_array(23, 0x12, 0x01), [*LED_BLOCK, *MODE_TWO_BLOCK])

    def test_a_paused_output_format_has_no_samples(self):
        self.config_bpm(0x01)
        self.assertEqual(self.command(0x10, 0x00, 0x00), 0x00)
        self.assertEqual(self.read_one(0x12, 0x00), 0)
        self.write(0x12, 0x01)
        self.assertEqual(self.read(2), [0xFE, 0xFF])

    def test_max30101_configuration_register_round_trips(self):
        self.assertEqual(self.read_one(0x41, 0x03, 0x0A), 0x27)
        self.assertEqual(self.command(0x40, 0x03, 0x0A, 0x6F), 0x00)
        self.assertEqual(self.read_one(0x41, 0x03, 0x0A), 0x6F)

    def test_max30101_part_and_revision_id(self):
        self.assertEqual(self.read_one(0x41, 0x03, 0xFF), 0x15)
        self.assertEqual(self.read_one(0x41, 0x03, 0xFE), 0x01)

    def test_register_dump_is_36_bytes(self):
        dump = self.read_array(36, 0x43, 0x03)
        self.assertEqual(dump[0x0A], 0x27)
        self.assertEqual(self.read(1), [0xFF])

    def test_afe_attributes(self):
        self.assertEqual(self.read_array(2, 0x42, 0x03), [3, 36])
        self.assertEqual(self.read_array(2, 0x42, 0x04), [1, 0])

    def test_a_register_outside_the_max30101_file_raises(self):
        with self.assertRaisesRegex(ValueError, 'out of range'):
            self.write(0x41, 0x03, 0x40)
        self.slave.handle_event(I2C_FINISH)
        with self.assertRaisesRegex(ValueError, 'out of range'):
            self.write(0x40, 0x03, 0x40, 0x00)

    def test_accelerometer_registers_raise(self):
        for command in ((0x41, 0x04, 0x00), (0x40, 0x04, 0x00, 0x00), (0x43, 0x04)):
            with self.assertRaisesRegex(ValueError, 'no accelerometer'):
                self.write(*command)
            self.slave.handle_event(I2C_FINISH)

    def test_agc_configuration_round_trips(self):
        for config_id, value in enumerate((60, 12, 30, 4)):
            self.assertEqual(self.command(0x50, 0x00, config_id, value), 0x00)
        self.assertEqual([self.read_one(0x51, 0x00, i) for i in range(4)], [60, 12, 30, 4])

    def test_agc_defaults(self):
        self.assertEqual([self.read_one(0x51, 0x00, i) for i in range(4)], [0x0C, 0x14, 0x14, 0x01])

    def test_spo2_coefficients_round_trip_signed(self):
        defaults = b''.join(c.to_bytes(4, 'big', signed=True) for c in (159584, -3465966, 11268987))
        self.assertEqual(bytes(self.read_array(12, 0x51, 0x02, 0x0B)), defaults)
        payload = b''.join(c.to_bytes(4, 'big', signed=True) for c in (-1, 2, -300000))
        self.assertEqual(self.command(0x50, 0x02, 0x0B, *payload), 0x00)
        self.assertEqual(bytes(self.read_array(12, 0x51, 0x02, 0x0B)), payload)

    def test_identity(self):
        self.assertEqual(self.read_one(0xFF, 0x00, 0x00), 0x01)
        self.assertEqual(self.read_array(3, 0xFF, 0x03), [10, 1, 0])
        self.assertEqual(self.read_array(3, 0xFF, 0x07), [10, 1, 0])

    def test_sensor_enable_state_reads_back(self):
        self.assertEqual(self.read_one(0x45, 0x03), 0)
        self.command(0x44, 0x03, 0x01)
        self.assertEqual(self.read_one(0x45, 0x03), 1)
        self.command(0x44, 0x03, 0x00)
        self.assertEqual(self.read_one(0x45, 0x03), 0)

    def test_output_mode_reads_back(self):
        self.command(0x10, 0x00, 0x03)
        self.assertEqual(self.read_one(0x11, 0x00), 0x03)

    def test_device_mode_commands(self):
        self.begin(mfio_high=False)
        self.assertEqual(self.command(0x01, 0x00, 0x02), 0x00)
        self.assertEqual(self.read_one(0x02, 0x00), 0x00)
        self.assertEqual(self.command(0x01, 0x00, 0x08), 0x00)
        self.assertEqual(self.read_one(0x02, 0x00), 0x08)
        self.assertEqual(self.command(0x01, 0x00, 0x00), 0x00)
        self.assertEqual(self.read_one(0x02, 0x00), 0x00)

    def test_bootloader_mode_refuses_application_commands(self):
        self.begin(mfio_high=False)
        self.write(0x12, 0x01)
        self.assertEqual(self.read(2), [0x01, 0xFF])
        self.assertEqual(self.command(0x44, 0x03, 0x01), 0x01)
        self.assertFalse(self.slave.sensor_enabled)

    def test_unsupported_commands_raise(self):
        for command, message in (
            ((0x80, 0x00), 'bootloader'),
            ((0x81, 0x00), 'bootloader'),
            ((0x50, 0x04, 0x00), 'blood-pressure'),
            ((0x51, 0x04, 0x00), 'blood-pressure'),
            ((0x77, 0x00), 'unsupported family'),
            ((0x02,), 'truncated command'),
            ((0x10, 0x00), r'takes 1 argument\(s\), got 0'),
            ((0x02, 0x00, 0x00), r'takes 0 argument\(s\), got 1'),
            ((0x01, 0x00, 0x05), 'unsupported device mode'),
        ):
            with self.assertRaisesRegex(ValueError, message):
                self.write(*command)
            self.slave.handle_event(I2C_FINISH)

    def test_zero_length_probe_leaves_state_and_reply_untouched(self):
        self.config_bpm(0x01)
        self.write(0x02, 0x00)
        self.write()
        self.assertEqual(self.slave.algorithm_mode, 1)
        self.assertEqual(self.read(2), [0x00, 0x00])

    def test_reading_past_the_reply_returns_ff(self):
        self.write(0x02, 0x00)
        self.assertEqual(self.read(4), [0x00, 0x00, 0xFF, 0xFF])

    def test_a_reply_spans_read_transfers(self):
        self.write(0xFF, 0x03)
        self.assertEqual(self.read(2), [0x00, 10])
        self.assertEqual(self.read(3), [1, 0, 0xFF])

    def test_a_second_command_replaces_the_first_reply(self):
        self.write(0x10, 0x00, 0x02)
        self.write(0x11, 0x00)
        self.assertEqual(self.read(2), [0x00, 0x02])

    def test_a_read_before_any_command_returns_ff(self):
        self.assertEqual(self.read(2), [0xFF, 0xFF])

    def test_a_repeated_start_read_gets_the_reply(self):
        # A repeated START reaches the slave as FINISH + START_RECV.
        self.write(0x02, 0x00)
        self.assertEqual(self.read(2), [0x00, 0x00])


def test_max32664_rejects_an_unknown_i2c_event():
    with pytest.raises(ValueError, match='max32664: unsupported I2C event 0x02'):
        MAX32664Slave().handle_event(0x02)
