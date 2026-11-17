"""Unit tests for embedgym_parts/i2c/bme280.py (BME280Slave): the frontend-mirroring cases
over the picsimlab I2C event encoding, then the register-level cases."""
from __future__ import annotations

import unittest

import pytest

from esp32_i2c_slaves import I2C_FINISH, I2C_READ, I2C_START_RECV, I2C_START_SEND
from embedgym_parts.i2c.bme280 import BME280Slave
from embedgym_parts.i2c.js_math import cdiv, i32, imul, js_round
from i2c_bus import i2c_read_seq, i2c_write_seq, int8, read_regs, write_event


# ── BME280 ────────────────────────────────────────────────────────────────────
# Mirrors frontend/src/__tests__/bme280-protocol.test.ts: `AdafruitBme280` is
# the same line-for-line port of Adafruit_BME280's register traffic and
# compensation math, run once over the I2C event encoding and once over the
# SPI byte transport.


REG_DIG_H1, REG_DIG_H2 = 0xA1, 0xE1
REG_CHIPID, REG_SOFTRESET = 0xD0, 0xE0
REG_CONTROLHUMID, REG_STATUS, REG_CONTROL, REG_CONFIG = 0xF2, 0xF3, 0xF4, 0xF5
REG_PRESSUREDATA, REG_TEMPDATA, REG_HUMIDDATA = 0xF7, 0xFA, 0xFD

MODE_SLEEP, MODE_FORCED, MODE_NORMAL = 0b00, 0b01, 0b11
SAMPLING_NONE, SAMPLING_X1, SAMPLING_X16 = 0b000, 0b001, 0b101

CALIBRATION = dict(
    T1=27504, T2=26435, T3=-1000,
    P1=36477, P2=-10685, P3=3024, P4=2855, P5=140, P6=-7, P7=15500, P8=-14600, P9=6000,
    H1=75, H2=362, H3=0, H4=315, H5=50, H6=30,
)

SKIPPED_20BIT = [0x80, 0x00, 0x00]
SKIPPED_16BIT = [0x80, 0x00]




class I2cTransport:
    """Adafruit_I2CDevice: write [reg, value] STOP; write_then_read = pointer write,
    repeated START (I2C_FINISH + I2C_START_RECV), reads, STOP."""

    def __init__(self, dev: BME280Slave):
        self.dev = dev

    def write8(self, reg: int, value: int) -> None:
        assert self.dev.handle_event(I2C_START_SEND) == 0
        assert self.dev.handle_event(write_event(reg)) == 0
        assert self.dev.handle_event(write_event(value)) == 0
        self.dev.handle_event(I2C_FINISH)

    def read(self, reg: int, n: int) -> list[int]:
        return read_regs(self.dev, reg, n)


class SpiTransport:
    """Adafruit_SPIDevice: CS low, control byte (bit 7 clear = write, set = read), data, CS high."""

    def __init__(self, dev: BME280Slave):
        self.dev = dev

    def write8(self, reg: int, value: int) -> None:
        self.dev.spi_transfer(reg & ~0x80)
        self.dev.spi_transfer(value)
        self.dev.spi_deselect()

    def read(self, reg: int, n: int) -> list[int]:
        self.dev.spi_transfer(reg | 0x80)
        out = [self.dev.spi_transfer(0xFF) for _ in range(n)]
        self.dev.spi_deselect()
        return out


class AdafruitBme280:
    def __init__(self, bus):
        self.bus = bus
        self.c = dict(CALIBRATION)
        self.t_fine = 0
        self.sensor_id = 0
        self.mode, self.osrs_t, self.osrs_p, self.osrs_h = MODE_NORMAL, SAMPLING_X16, SAMPLING_X16, SAMPLING_X16

    def read8(self, reg: int) -> int:
        return self.bus.read(reg, 1)[0]

    def read16(self, reg: int) -> int:
        a, b = self.bus.read(reg, 2)
        return (a << 8) | b

    def read16le(self, reg: int) -> int:
        v = self.read16(reg)
        return ((v >> 8) | (v << 8)) & 0xFFFF

    def reads16le(self, reg: int) -> int:
        v = self.read16le(reg)
        return v - 0x10000 if v > 0x7FFF else v

    def read24(self, reg: int) -> int:
        a, b, c = self.bus.read(reg, 3)
        return (a << 16) | (b << 8) | c

    def begin(self) -> bool:
        self.sensor_id = self.read8(REG_CHIPID)
        if self.sensor_id != 0x60:
            return False
        self.bus.write8(REG_SOFTRESET, 0xB6)
        for i in range(200):
            if not self.read8(REG_STATUS) & 0x01:
                break
        else:
            raise AssertionError('im_update never cleared')
        self.read_coefficients()
        self.set_sampling()
        return True

    def set_sampling(self, mode=MODE_NORMAL, temp=SAMPLING_X16, press=SAMPLING_X16,
                     hum=SAMPLING_X16, filt=0, standby=0) -> None:
        self.mode, self.osrs_t, self.osrs_p, self.osrs_h = mode, temp, press, hum
        self.bus.write8(REG_CONTROL, MODE_SLEEP)
        self.bus.write8(REG_CONTROLHUMID, hum)
        self.bus.write8(REG_CONFIG, (standby << 5) | (filt << 2))
        self.bus.write8(REG_CONTROL, self.ctrl_meas())

    def ctrl_meas(self) -> int:
        return (self.osrs_t << 5) | (self.osrs_p << 2) | self.mode

    def take_forced_measurement(self) -> bool:
        if self.mode != MODE_FORCED:
            return False
        self.bus.write8(REG_CONTROL, self.ctrl_meas())
        for i in range(200):
            if not self.read8(REG_STATUS) & 0x08:
                break
        else:
            raise AssertionError('measuring never cleared')
        return True

    def read_coefficients(self) -> dict:
        c = self.c
        c['T1'] = self.read16le(0x88); c['T2'] = self.reads16le(0x8A); c['T3'] = self.reads16le(0x8C)
        c['P1'] = self.read16le(0x8E); c['P2'] = self.reads16le(0x90); c['P3'] = self.reads16le(0x92)
        c['P4'] = self.reads16le(0x94); c['P5'] = self.reads16le(0x96); c['P6'] = self.reads16le(0x98)
        c['P7'] = self.reads16le(0x9A); c['P8'] = self.reads16le(0x9C); c['P9'] = self.reads16le(0x9E)
        c['H1'] = self.read8(REG_DIG_H1)
        c['H2'] = self.reads16le(REG_DIG_H2)
        c['H3'] = self.read8(0xE3)
        c['H4'] = (int8(self.read8(0xE4)) << 4) | (self.read8(0xE5) & 0x0F)
        c['H5'] = (int8(self.read8(0xE6)) << 4) | (self.read8(0xE5) >> 4)
        c['H6'] = int8(self.read8(0xE7))
        return dict(c)

    def read_temperature(self) -> float:
        if self.osrs_t == SAMPLING_NONE:
            return float('nan')
        c = self.c
        adc_t = self.read24(REG_TEMPDATA) >> 4
        var1 = i32(cdiv(adc_t, 8) - c['T1'] * 2)
        var1 = cdiv(imul(var1, c['T2']), 2048)
        var2 = i32(cdiv(adc_t, 16) - c['T1'])
        var2 = cdiv(imul(cdiv(imul(var2, var2), 4096), c['T3']), 16384)
        self.t_fine = i32(var1 + var2)
        return cdiv(self.t_fine * 5 + 128, 256) / 100

    def read_pressure(self) -> float:
        if self.osrs_p == SAMPLING_NONE:
            return float('nan')
        self.read_temperature()
        c = self.c
        adc_p = self.read24(REG_PRESSUREDATA) >> 4
        var1 = self.t_fine - 128000
        var2 = var1 * var1 * c['P6']
        var2 = var2 + var1 * c['P5'] * 131072
        var2 = var2 + c['P4'] * 34359738368
        var1 = cdiv(var1 * var1 * c['P3'], 256) + var1 * c['P2'] * 4096
        var1 = cdiv((140737488355328 + var1) * c['P1'], 8589934592)
        if var1 == 0:
            return 0.0
        var4 = 1048576 - adc_p
        var4 = cdiv((var4 * 2147483648 - var2) * 3125, var1)
        var1 = cdiv(c['P9'] * cdiv(var4, 8192) * cdiv(var4, 8192), 33554432)
        var2 = cdiv(c['P8'] * var4, 524288)
        var4 = cdiv(var4 + var1 + var2, 256) + c['P7'] * 16
        return var4 / 256

    def read_humidity(self) -> float:
        if self.osrs_h == SAMPLING_NONE:
            return float('nan')
        self.read_temperature()
        c = self.c
        adc_h = self.read16(REG_HUMIDDATA)
        var1 = i32(self.t_fine - 76800)
        var2 = i32(adc_h * 16384)
        var3 = i32(c['H4'] * 1048576)
        var4 = imul(c['H5'], var1)
        var5 = cdiv(i32(i32(var2 - var3) - var4) + 16384, 32768)
        var2 = cdiv(imul(var1, c['H6']), 1024)
        var3 = cdiv(imul(var1, c['H3']), 2048)
        var4 = i32(cdiv(imul(var2, i32(var3 + 32768)), 1024) + 2097152)
        var2 = cdiv(imul(var4, c['H2']) + 8192, 16384)
        var3 = imul(var5, var2)
        var4 = cdiv(imul(cdiv(var3, 32768), cdiv(var3, 32768)), 128)
        var5 = i32(var3 - cdiv(imul(var4, c['H1']), 16))
        var5 = max(0, min(419430400, var5))
        return (cdiv(var5, 4096) & 0xFFFFFFFF) / 1024


# One humidity ADC LSB moves the compensated value by up to ~12/1024 %RH, and
# the model serves the lowest raw value that reaches the target.
HUMIDITY_LSB_PCT = 12 / 1024

TRANSPORTS = [pytest.param(I2cTransport, id='I2C'), pytest.param(SpiTransport, id='SPI')]


def bme_setup(transport, addr: int = 0x76):
    dev = BME280Slave(addr)
    bus = transport(dev)
    return dev, bus, AdafruitBme280(bus)


def expect_readings(lib: AdafruitBme280, t: float, p: float, h: float) -> None:
    assert lib.read_temperature() == pytest.approx(t, abs=0.005)
    assert lib.read_pressure() / 100 == pytest.approx(p, abs=0.005)
    humidity = lib.read_humidity()
    assert h <= humidity < h + HUMIDITY_LSB_PCT


@pytest.mark.parametrize('transport', TRANSPORTS)
def test_bme280_begin_reads_chip_id_0x60(transport):
    _, _, lib = bme_setup(transport)
    assert lib.begin() is True
    assert lib.sensor_id == 0x60


@pytest.mark.parametrize('transport', TRANSPORTS)
def test_bme280_serves_the_calibration_block(transport):
    _, _, lib = bme_setup(transport)
    lib.begin()
    assert lib.read_coefficients() == CALIBRATION


@pytest.mark.parametrize('transport', TRANSPORTS)
def test_bme280_status_and_default_sampling_registers(transport):
    _, bus, lib = bme_setup(transport)
    lib.begin()
    assert lib.read8(REG_STATUS) == 0x00
    assert bus.read(REG_CONTROLHUMID, 1) == [SAMPLING_X16]
    assert bus.read(REG_CONTROL, 1) == [(SAMPLING_X16 << 5) | (SAMPLING_X16 << 2) | MODE_NORMAL]
    assert bus.read(REG_CONFIG, 1) == [0x00]


@pytest.mark.parametrize('transport', TRANSPORTS)
def test_bme280_power_on_defaults(transport):
    _, _, lib = bme_setup(transport)
    lib.begin()
    expect_readings(lib, 25, 1013.25, 50)


@pytest.mark.parametrize('transport', TRANSPORTS)
@pytest.mark.parametrize('t,p,h', [
    (-40, 300, 0), (-10, 800, 10), (0, 950, 33), (18, 1000, 37),
    (25, 1013.25, 50), (31, 1005.5, 64), (60, 1050, 90), (85, 1100, 100),
])
def test_bme280_readings_track_the_supplied_values(transport, t, p, h):
    dev, _, lib = bme_setup(transport)
    lib.begin()
    dev.temperature_c = t
    dev.pressure_hpa = p
    dev.humidity_pct = h
    expect_readings(lib, t, p, h)


@pytest.mark.parametrize('t,h', [(31, 64), (18, 37), (30, 80), (25, 50)])
def test_bme280_task_values_print_exactly_at_one_decimal(t, h):
    """The shared bme280 task rows assert `%.1f` equality on these drives."""
    dev, _, lib = bme_setup(I2cTransport)
    lib.begin()
    dev.temperature_c = t
    dev.humidity_pct = h
    assert f'{lib.read_temperature():.1f}' == f'{t:.1f}'
    assert f'{lib.read_humidity():.1f}' == f'{h:.1f}'


def test_bme280_humidity_follows_a_temperature_change_alone():
    dev, _, lib = bme_setup(I2cTransport)
    lib.begin()
    dev.humidity_pct = 64
    dev.temperature_c = -10
    expect_readings(lib, -10, 1013.25, 64)
    dev.temperature_c = 60
    expect_readings(lib, 60, 1013.25, 64)


@pytest.mark.parametrize('transport', TRANSPORTS)
def test_bme280_soft_reset_clears_controls_and_data_reads_skip(transport):
    dev, bus, lib = bme_setup(transport)
    lib.begin()
    dev.temperature_c = 30
    bus.write8(REG_SOFTRESET, 0xB6)
    assert bus.read(REG_CONTROLHUMID, 1) == [0]
    assert bus.read(REG_CONTROL, 1) == [0]
    assert bus.read(REG_CONFIG, 1) == [0]
    assert bus.read(REG_PRESSUREDATA, 8) == SKIPPED_20BIT + SKIPPED_20BIT + SKIPPED_16BIT
    assert lib.read_coefficients() == CALIBRATION


def test_bme280_oversampling_none_skips_that_channel():
    dev, bus, lib = bme_setup(I2cTransport)
    lib.begin()
    lib.set_sampling(MODE_NORMAL, SAMPLING_X1, SAMPLING_NONE, SAMPLING_NONE)
    data = bus.read(REG_PRESSUREDATA, 8)
    assert data[0:3] == SKIPPED_20BIT
    assert data[3:6] != SKIPPED_20BIT
    assert data[6:8] == SKIPPED_16BIT
    assert lib.read_temperature() == pytest.approx(25, abs=0.005)


def test_bme280_forced_mode_measures_once_and_drops_to_sleep():
    dev, bus, lib = bme_setup(I2cTransport)
    lib.begin()
    lib.set_sampling(MODE_FORCED, SAMPLING_X1, SAMPLING_X1, SAMPLING_X1)
    assert bus.read(REG_CONTROL, 1) == [(SAMPLING_X1 << 5) | (SAMPLING_X1 << 2) | MODE_SLEEP]
    dev.temperature_c = 40
    assert lib.read_temperature() == pytest.approx(25, abs=0.005)   # not measured yet
    assert lib.take_forced_measurement() is True
    assert lib.read_temperature() == pytest.approx(40, abs=0.005)
    dev.temperature_c = 10
    assert lib.read_temperature() == pytest.approx(40, abs=0.005)   # holds until the next FORCED write


def test_bme280_sleep_mode_holds_the_last_measurement():
    dev, bus, lib = bme_setup(I2cTransport)
    lib.begin()
    dev.temperature_c = 33
    bus.write8(REG_CONTROL, (SAMPLING_X16 << 5) | (SAMPLING_X16 << 2) | MODE_SLEEP)
    dev.temperature_c = 44
    assert lib.read_temperature() == pytest.approx(33, abs=0.005)


def test_bme280_ctrl_hum_only_applies_on_the_next_ctrl_meas_write():
    dev, bus, lib = bme_setup(I2cTransport)
    lib.begin()
    bus.write8(REG_CONTROLHUMID, SAMPLING_NONE)
    dev.humidity_pct = 70
    assert bus.read(REG_HUMIDDATA, 2) != SKIPPED_16BIT
    bus.write8(REG_CONTROL, lib.ctrl_meas())
    assert bus.read(REG_HUMIDDATA, 2) == SKIPPED_16BIT


@pytest.mark.parametrize('reg,value,match', [
    (REG_SOFTRESET, 0x00, 'only 0xB6'),
    (REG_CONTROLHUMID, 0x08, 'reserved bits'),
    (REG_CONFIG, 0x01, '3-wire SPI'),
    (REG_CHIPID, 0x60, 'read-only'),
])
@pytest.mark.parametrize('transport', TRANSPORTS)
def test_bme280_unsupported_writes_raise(transport, reg, value, match):
    _, bus, lib = bme_setup(transport)
    lib.begin()
    with pytest.raises(ValueError, match=match):
        bus.write8(reg, value)


def test_bme280_i2c_pointer_survives_the_repeated_start_and_a_probe_transaction():
    dev = BME280Slave()
    # An empty probe (START, STOP) leaves the device expecting a pointer.
    dev.handle_event(I2C_START_SEND); dev.handle_event(I2C_FINISH)
    assert read_regs(dev, 0x88, 26)[-1] == CALIBRATION['H1']      # auto-increment through 0xA1
    # Several (register, data) pairs in one transaction all apply.
    dev.handle_event(I2C_START_SEND)
    dev.handle_event(write_event(REG_CONTROLHUMID)); dev.handle_event(write_event(SAMPLING_X1))
    dev.handle_event(write_event(REG_CONFIG)); dev.handle_event(write_event(0xA0))
    dev.handle_event(I2C_FINISH)
    assert read_regs(dev, REG_CONTROLHUMID, 1) == [SAMPLING_X1]
    assert read_regs(dev, REG_CONFIG, 1) == [0xA0]
    assert BME280Slave(0x77).addr == 0x77


def test_bme280_spi_write_pairs_and_read_bursts():
    dev = BME280Slave()
    # A write is one (control, data) pair; the next byte starts a new transaction.
    dev.spi_transfer(REG_CONTROLHUMID & ~0x80); dev.spi_transfer(SAMPLING_X1)
    dev.spi_transfer(REG_CONFIG & ~0x80); dev.spi_transfer(0xA0)
    dev.spi_deselect()
    assert SpiTransport(dev).read(REG_CONTROLHUMID, 1) == [SAMPLING_X1]
    assert SpiTransport(dev).read(REG_CONFIG, 1) == [0xA0]
    # A read burst auto-increments until CS rises; the control byte returns 0x00.
    assert dev.spi_transfer(0x88 | 0x80) == 0x00
    burst = [dev.spi_transfer(0xFF) for _ in range(26)]
    assert burst[-1] == CALIBRATION['H1']
    # A deselect mid-burst abandons it.
    dev.spi_transfer(REG_CHIPID | 0x80)
    dev.spi_deselect()
    dev.spi_transfer(REG_STATUS | 0x80)
    assert dev.spi_transfer(0xFF) == 0x00


# IIR filter (datasheet 3.4.4), mirroring bme280-protocol.test.ts.

FILTER_X2, FILTER_X4, FILTER_X16 = 0b001, 0b010, 0b100


def adc20(bus, reg: int) -> int:
    msb, lsb, xlsb = bus.read(reg, 3)
    return (msb << 12) | (lsb << 4) | (xlsb >> 4)


def unfiltered(transport, t: float, p: float, h: float) -> dict:
    dev, bus, lib = bme_setup(transport)
    lib.begin()
    dev.temperature_c = t
    dev.pressure_hpa = p
    dev.humidity_pct = h
    return {'press': adc20(bus, REG_PRESSUREDATA), 'temp': adc20(bus, REG_TEMPDATA),
            'hum': bus.read(REG_HUMIDDATA, 2)}


@pytest.mark.parametrize('transport', TRANSPORTS)
def test_bme280_filter_forced_steps_temperature_and_pressure_not_humidity(transport):
    before = unfiltered(transport, 25, 1013.25, 50)
    after = unfiltered(transport, 30, 1000, 80)
    dev, bus, lib = bme_setup(transport)
    lib.begin()
    lib.set_sampling(MODE_FORCED, SAMPLING_X1, SAMPLING_X1, SAMPLING_X1, FILTER_X4)
    assert adc20(bus, REG_TEMPDATA) == before['temp']
    assert adc20(bus, REG_PRESSUREDATA) == before['press']
    dev.temperature_c = 30
    dev.pressure_hpa = 1000
    dev.humidity_pct = 80
    temp, press = before['temp'], before['press']
    for _ in range(5):
        lib.take_forced_measurement()
        temp = (temp * 3 + after['temp']) / 4
        press = (press * 3 + after['press']) / 4
        assert adc20(bus, REG_TEMPDATA) == js_round(temp)
        assert adc20(bus, REG_PRESSUREDATA) == js_round(press)
        assert bus.read(REG_HUMIDDATA, 2) == after['hum']
    for _ in range(60):
        lib.take_forced_measurement()
    expect_readings(lib, 30, 1000, 80)


@pytest.mark.parametrize('transport', TRANSPORTS)
@pytest.mark.parametrize('code,coefficient', [(1, 2), (2, 4), (3, 8), (4, 16), (5, 16), (6, 16), (7, 16)])
def test_bme280_filter_coefficients(transport, code, coefficient):
    before = unfiltered(transport, 25, 1013.25, 50)
    after = unfiltered(transport, 30, 1013.25, 50)
    dev, bus, lib = bme_setup(transport)
    lib.begin()
    lib.set_sampling(MODE_FORCED, SAMPLING_X1, SAMPLING_X1, SAMPLING_X1, code)
    dev.temperature_c = 30
    lib.take_forced_measurement()
    assert adc20(bus, REG_TEMPDATA) == js_round((before['temp'] * (coefficient - 1) + after['temp']) / coefficient)


@pytest.mark.parametrize('transport', TRANSPORTS)
def test_bme280_config_write_resets_the_filter(transport):
    after = unfiltered(transport, 30, 1013.25, 50)
    dev, bus, lib = bme_setup(transport)
    lib.begin()
    lib.set_sampling(MODE_FORCED, SAMPLING_X1, SAMPLING_X1, SAMPLING_X1, FILTER_X16)
    dev.temperature_c = 30
    lib.take_forced_measurement()
    assert adc20(bus, REG_TEMPDATA) != after['temp']
    bus.write8(REG_CONFIG, FILTER_X16 << 2)
    lib.take_forced_measurement()
    assert adc20(bus, REG_TEMPDATA) == after['temp']


@pytest.mark.parametrize('transport', TRANSPORTS)
def test_bme280_skipped_channel_keeps_its_filter_memory(transport):
    before = unfiltered(transport, 25, 1013.25, 50)
    after = unfiltered(transport, 30, 1013.25, 50)
    dev, bus, lib = bme_setup(transport)
    lib.begin()
    lib.set_sampling(MODE_FORCED, SAMPLING_X1, SAMPLING_X1, SAMPLING_X1, FILTER_X2)
    bus.write8(REG_CONTROL, (SAMPLING_NONE << 5) | (SAMPLING_X1 << 2) | MODE_FORCED)
    assert bus.read(REG_TEMPDATA, 3) == SKIPPED_20BIT
    dev.temperature_c = 30
    lib.take_forced_measurement()
    assert adc20(bus, REG_TEMPDATA) == js_round((before['temp'] + after['temp']) / 2)


@pytest.mark.parametrize('transport', TRANSPORTS)
def test_bme280_clockless_normal_mode_reads_the_settled_filter(transport):
    before = unfiltered(transport, 25, 1013.25, 50)
    after = unfiltered(transport, 30, 1013.25, 50)
    dev, bus, lib = bme_setup(transport)
    lib.begin()
    lib.set_sampling(MODE_NORMAL, SAMPLING_X1, SAMPLING_X1, SAMPLING_X1, FILTER_X4)
    dev.temperature_c = 30
    assert adc20(bus, REG_TEMPDATA) == after['temp']
    dev.temperature_c = 25
    assert adc20(bus, REG_TEMPDATA) == before['temp']


class NsClock:
    def __init__(self) -> None:
        self.ns = 0

    def __call__(self) -> int:
        return self.ns


def test_bme280_clocked_forced_measurement_completes_after_the_typical_time():
    clock = NsClock()
    dev = BME280Slave(0x76, now_ns=clock)
    assert dev.read_register(0xF3) == 0x01          # im_update during start-up
    clock.ns = 2_000_000
    assert dev.read_register(0xF3) == 0x00
    dev.update(temperature_c=31.0)
    dev.write_register(0xF4, (1 << 5) | (1 << 2) | 0b01)   # osrs_t = osrs_p = x1, forced
    # 1 ms + 2 ms (T) + 2.5 ms (P) = 5.5 ms
    assert dev.read_register(0xF3) == 0x08
    assert dev.read_register(0xFA) == 0x80           # still the reset value
    clock.ns += 5_499_999
    dev.sync()
    assert dev.read_register(0xF3) == 0x08
    clock.ns += 1
    dev.sync()
    assert dev.read_register(0xF3) == 0x00
    assert dev.read_register(0xF4) & 0x03 == 0       # back to sleep
    assert dev.read_register(0xFA) != 0x80


def test_bme280_clocked_normal_mode_shows_a_mid_cycle_value_at_the_next_measurement():
    clock = NsClock()
    dev = BME280Slave(0x76, now_ns=clock)
    dev.write_register(0xF5, 0b000 << 5)                   # 0.5 ms standby
    dev.write_register(0xF4, (1 << 5) | 0b11)              # osrs_t x1, normal: 3 ms
    clock.ns = 3_000_000
    dev.sync()
    first = dev.read_register(0xFA)
    dev.update(temperature_c=-20.0)
    assert dev.read_register(0xFA) == first
    clock.ns = 3_000_000 + 500_000 + 3_000_000
    dev.sync()
    assert dev.read_register(0xFA) != first


def test_bme280_update_rejects_out_of_range_values():
    dev = BME280Slave(0x76, now_ns=NsClock())
    with pytest.raises(ValueError, match='humidity_pct'):
        dev.update(humidity_pct=101)


class Bme280Host:
    """What a firmware does with the calibration it reads: the three
    compensation variants in circulation, written from the datasheet."""

    def __init__(self, slave):
        cal = bytes(i2c_read_seq(slave, 0x88, 26))
        hum = bytes(i2c_read_seq(slave, 0xE1, 7))
        u16 = lambda b, i: int.from_bytes(b[i:i + 2], 'little')
        s16 = lambda b, i: int.from_bytes(b[i:i + 2], 'little', signed=True)
        self.t = [u16(cal, 0), s16(cal, 2), s16(cal, 4)]
        self.p = [u16(cal, 6)] + [s16(cal, 8 + 2 * i) for i in range(8)]
        self.h1 = cal[25]
        self.h2 = s16(hum, 0)
        self.h3 = hum[2]
        self.h4 = (int.from_bytes(hum[3:4], 'little', signed=True) << 4) | (hum[4] & 0x0F)
        self.h5 = (int.from_bytes(hum[5:6], 'little', signed=True) << 4) | (hum[4] >> 4)
        self.h6 = int.from_bytes(hum[6:7], 'little', signed=True)

    def t_fine_shift(self, adc_t):
        t1, t2, t3 = self.t
        return ((((adc_t >> 3) - (t1 << 1)) * t2) >> 11) + ((((((adc_t >> 4) - t1) ** 2) >> 12) * t3) >> 14)

    def t_fine_float(self, adc_t):
        t1, t2, t3 = self.t
        v1 = (adc_t / 16384.0 - t1 / 1024.0) * t2
        v2 = (adc_t / 131072.0 - t1 / 8192.0) ** 2 * t3
        return v1 + v2

    def temp_shift(self, adc_t):
        return ((self.t_fine_shift(adc_t) * 5 + 128) >> 8) / 100

    def temp_float(self, adc_t):
        return self.t_fine_float(adc_t) / 5120.0

    def hum_shift(self, adc_h, t_fine):
        v = t_fine - 76800
        v = ((((adc_h << 14) - (self.h4 << 20) - self.h5 * v) + 16384) >> 15) * (
            (((((v * self.h6) >> 10) * (((v * self.h3) >> 11) + 32768)) >> 10) + 2097152) * self.h2 + 8192 >> 14)
        v = v - (((((v >> 15) * (v >> 15)) >> 7) * self.h1) >> 4)
        return (max(0, min(419430400, v)) >> 12) / 1024

    def hum_float(self, adc_h, t_fine):
        v = t_fine - 76800.0
        v = (adc_h - (self.h4 * 64.0 + self.h5 / 16384.0 * v)) * (
            self.h2 / 65536.0 * (1.0 + self.h6 / 67108864.0 * v * (1.0 + self.h3 / 67108864.0 * v)))
        v = v * (1.0 - self.h1 * v / 524288.0)
        return max(0.0, min(100.0, v))

    def press_int64(self, adc_p, t_fine):
        p1, p2, p3, p4, p5, p6, p7, p8, p9 = self.p
        v1 = t_fine - 128000
        v2 = v1 * v1 * p6 + ((v1 * p5) << 17) + (p4 << 35)
        v1 = ((v1 * v1 * p3) >> 8) + ((v1 * p2) << 12)
        v1 = (((1 << 47) + v1) * p1) >> 33
        p = 1048576 - adc_p
        p = (((p << 31) - v2) * 3125) // v1
        v1 = (p9 * (p >> 13) * (p >> 13)) >> 25
        v2 = (p8 * p) >> 19
        return (((p + v1 + v2) >> 8) + (p7 << 4)) / 25600


class TestBME280Slave(unittest.TestCase):
    """Register file, mode and measurement timing on an injected clock, and the
    raw values against every compensation variant a firmware may run."""

    FORCED_1X = 0x25   # osrs_t x1, osrs_p x1, forced
    NORMAL_1X = 0x27
    MEASURE_1X_MS = 8  # 1 + 2 + 2.5 + 2.5

    def setUp(self):
        self.ns = 0
        self.slave = BME280Slave(0x76, lambda: self.ns)

    def advance(self, ms: float) -> None:
        self.ns += int(ms * 1_000_000)

    def write(self, reg: int, value: int) -> None:
        i2c_write_seq(self.slave, reg, [value])

    def data(self) -> tuple:
        d = i2c_read_seq(self.slave, 0xF7, 8)
        return (d[0] << 12 | d[1] << 4 | d[2] >> 4, d[3] << 12 | d[4] << 4 | d[5] >> 4, d[6] << 8 | d[7])

    def status(self) -> int:
        return i2c_read_seq(self.slave, 0xF3, 1)[0]

    def measure_forced(self) -> tuple:
        self.write(0xF2, 0x01)
        self.write(0xF4, self.FORCED_1X)
        self.advance(self.MEASURE_1X_MS)
        return self.data()

    def test_chip_id_and_address(self):
        self.assertEqual(i2c_read_seq(self.slave, 0xD0, 1), [0x60])
        self.assertEqual(BME280Slave(0x77, lambda: 0).addr, 0x77)

    def test_calibration_block_layout(self):
        host = Bme280Host(self.slave)
        self.assertEqual(host.t, [27504, 26435, -1000])
        self.assertEqual(host.p, [36477, -10685, 3024, 2855, 140, -7, 15500, -14600, 6000])
        self.assertEqual((host.h1, host.h2, host.h3, host.h4, host.h5, host.h6), (75, 362, 0, 315, 50, 30))
        # dig_H4 = 0x13B and dig_H5 = 0x032 share 0xE5: H4[3:0] low nibble, H5[3:0] high nibble.
        self.assertEqual(i2c_read_seq(self.slave, 0xE4, 3), [0x13, 0x2B, 0x03])

    def test_power_on_state(self):
        self.assertEqual(self.status(), 0x01)
        self.advance(2)
        self.assertEqual(self.status(), 0x00)
        self.assertEqual(i2c_read_seq(self.slave, 0xF2, 1), [0])
        self.assertEqual(i2c_read_seq(self.slave, 0xF4, 2), [0, 0])
        self.assertEqual(self.data(), (0x80000, 0x80000, 0x8000))

    def test_sleep_never_measures(self):
        self.write(0xF2, 0x01)
        self.write(0xF4, 0x24)
        self.advance(5000)
        self.assertEqual(self.data(), (0x80000, 0x80000, 0x8000))

    def test_forced_measurement_takes_its_time_then_sleeps(self):
        self.advance(10)
        self.write(0xF2, 0x01)
        self.write(0xF4, self.FORCED_1X)
        self.assertEqual(self.status(), 0x08)
        self.assertEqual(i2c_read_seq(self.slave, 0xF4, 1), [self.FORCED_1X])
        self.advance(self.MEASURE_1X_MS - 0.001)
        self.assertEqual(self.status(), 0x08)
        self.assertEqual(self.data(), (0x80000, 0x80000, 0x8000))
        self.advance(0.001)
        self.assertEqual(self.status(), 0x00)
        self.assertEqual(i2c_read_seq(self.slave, 0xF4, 1), [self.FORCED_1X & ~0x03])
        self.assertNotIn(0x80000, self.data()[:2])

    def test_forced_mode_holds_the_measurement_until_the_next_trigger(self):
        first = self.measure_forced()
        self.slave.update(temperature_c=40, pressure_hpa=900, humidity_pct=20)
        self.advance(1000)
        self.assertEqual(self.data(), first)
        self.assertNotEqual(self.measure_forced(), first)

    def test_measurement_time_follows_oversampling(self):
        self.write(0xF2, 0x05)            # humidity x16
        self.write(0xF4, 0xB5)            # temperature x16, pressure x16, forced
        self.advance(1 + 32 + 32.5 + 32.5 - 0.001)
        self.assertEqual(self.status(), 0x08)
        self.advance(0.001)
        self.assertEqual(self.status(), 0x00)

    def test_normal_mode_repeats_after_standby(self):
        self.write(0xF2, 0x01)
        self.write(0xF5, 0x20)            # standby 62.5 ms
        self.write(0xF4, self.NORMAL_1X)
        self.advance(self.MEASURE_1X_MS)
        first = self.data()
        self.assertEqual(self.status(), 0x00)
        self.slave.update(temperature_c=40, pressure_hpa=900, humidity_pct=20)
        self.advance(62.5 - 0.001)
        self.assertEqual(self.status(), 0x00)
        self.assertEqual(self.data(), first)
        self.advance(0.001)
        self.assertEqual(self.status(), 0x08)
        self.advance(self.MEASURE_1X_MS)
        self.assertEqual(self.status(), 0x00)
        self.assertNotEqual(self.data(), first)
        self.assertEqual(i2c_read_seq(self.slave, 0xF4, 1), [self.NORMAL_1X])

    def test_filter_steps_once_per_normal_mode_measurement(self):
        self.write(0xF2, 0x01)
        self.write(0xF5, 0x20 | (FILTER_X4 << 2))   # standby 62.5 ms, filter 4
        self.write(0xF4, self.NORMAL_1X)
        self.advance(self.MEASURE_1X_MS)
        start = self.data()[1]
        target = BME280Slave(0x76)
        target.update(temperature_c=40)
        self.slave.update(temperature_c=40)
        goal = (target.regs[0xFA] << 12) | (target.regs[0xFB] << 4) | (target.regs[0xFC] >> 4)
        memory = start
        for _ in range(3):
            self.advance(62.5 + self.MEASURE_1X_MS)
            memory = (memory * 3 + goal) / 4
            self.assertEqual(self.data()[1], js_round(memory))
        self.advance(40 * (62.5 + self.MEASURE_1X_MS))
        self.assertEqual(self.data()[1], goal)
        self.write(0xF5, 0x20 | (FILTER_X4 << 2))
        self.slave.update(temperature_c=10)
        self.advance(62.5 + self.MEASURE_1X_MS)
        target.update(temperature_c=10)
        self.assertEqual(self.data()[1], (target.regs[0xFA] << 12) | (target.regs[0xFB] << 4) | (target.regs[0xFC] >> 4))

    def test_update_is_seen_by_the_next_measurement_not_a_past_one(self):
        self.write(0xF2, 0x01)
        self.write(0xF5, 0xA0)            # standby 1000 ms
        self.write(0xF4, self.NORMAL_1X)
        self.advance(500)
        self.slave.update(temperature_c=40, pressure_hpa=900, humidity_pct=20)
        host = Bme280Host(self.slave)
        self.assertAlmostEqual(host.temp_shift(self.data()[1]), 25.0, delta=0.01)
        self.advance(520)
        self.assertAlmostEqual(host.temp_shift(self.data()[1]), 40.0, delta=0.01)

    def test_ctrl_hum_applies_on_the_next_ctrl_meas_write(self):
        self.write(0xF4, self.FORCED_1X)
        self.write(0xF2, 0x01)
        self.advance(20)
        self.assertEqual(self.data()[2], 0x8000)
        self.write(0xF4, self.FORCED_1X)
        self.advance(20)
        self.assertNotEqual(self.data()[2], 0x8000)

    def test_skipped_channels_read_the_skip_value(self):
        self.write(0xF2, 0x00)
        self.write(0xF4, 0x21)            # temperature only
        self.advance(20)
        press, temp, hum = self.data()
        self.assertEqual((press, hum), (0x80000, 0x8000))
        self.assertNotEqual(temp, 0x80000)
        self.write(0xF2, 0x01)
        self.write(0xF4, 0x05)            # pressure only, humidity on
        self.advance(20)
        press, temp, hum = self.data()
        self.assertEqual(temp, 0x80000)
        self.assertNotEqual(press, 0x80000)
        self.assertNotEqual(hum, 0x8000)

    def test_soft_reset(self):
        self.write(0xF5, 0xA0)
        self.measure_forced()
        self.advance(100)
        self.write(0xE0, 0xB6)
        self.assertEqual(self.status(), 0x01)
        self.advance(2)
        self.assertEqual(self.status(), 0x00)
        self.assertEqual(i2c_read_seq(self.slave, 0xF2, 4), [0, 0, 0, 0])
        self.assertEqual(self.data(), (0x80000, 0x80000, 0x8000))
        self.assertEqual(Bme280Host(self.slave).h4, 315)

    def test_soft_reset_aborts_a_running_measurement(self):
        self.write(0xF4, self.NORMAL_1X)
        self.write(0xE0, 0xB6)
        self.advance(5000)
        self.assertEqual(self.data(), (0x80000, 0x80000, 0x8000))

    def test_writes_are_register_data_pairs(self):
        i2c_write_seq(self.slave, 0xF2, [0x01, 0xF5, 0xA0, 0xF4, self.NORMAL_1X])
        self.assertEqual(i2c_read_seq(self.slave, 0xF2, 1), [0x01])
        self.assertEqual(i2c_read_seq(self.slave, 0xF4, 2), [self.NORMAL_1X, 0xA0])

    def test_read_without_a_pointer_write_continues(self):
        i2c_read_seq(self.slave, 0xD0, 1)
        self.slave.handle_event(I2C_START_RECV)
        self.assertEqual(self.slave.handle_event(I2C_READ), self.slave.regs[0xD1])

    def test_burst_read_holds_still_across_a_measurement(self):
        self.write(0xF2, 0x01)
        self.write(0xF4, self.NORMAL_1X)
        self.advance(self.MEASURE_1X_MS)
        whole = i2c_read_seq(self.slave, 0xF7, 8)
        self.slave.update(temperature_c=-10, pressure_hpa=400, humidity_pct=90)
        self.slave.handle_event(I2C_START_SEND)
        self.slave.handle_event(write_event(0xF7))
        self.slave.handle_event(I2C_FINISH)
        self.slave.handle_event(I2C_START_RECV)
        seen = [self.slave.handle_event(I2C_READ) for _ in range(3)]
        self.advance(100)
        seen += [self.slave.handle_event(I2C_READ) for _ in range(5)]
        self.slave.handle_event(I2C_FINISH)
        self.assertEqual(seen, whole)
        self.assertNotEqual(i2c_read_seq(self.slave, 0xF7, 8), whole)

    def test_update_mid_burst_does_not_reach_the_rest_of_it(self):
        self.write(0xF2, 0x01)
        self.write(0xF4, self.NORMAL_1X)
        self.advance(self.MEASURE_1X_MS)
        whole = i2c_read_seq(self.slave, 0xF7, 8)
        self.slave.update(temperature_c=-10, pressure_hpa=400)
        self.slave.handle_event(I2C_START_SEND)
        self.slave.handle_event(write_event(0xF7))
        self.slave.handle_event(I2C_START_RECV)
        seen = [self.slave.handle_event(I2C_READ) for _ in range(3)]
        self.advance(100)
        self.slave.update(humidity_pct=90)     # completes the measurements due by now
        seen += [self.slave.handle_event(I2C_READ) for _ in range(5)]
        self.slave.handle_event(I2C_FINISH)
        self.assertEqual(seen, whole)
        self.assertNotEqual(i2c_read_seq(self.slave, 0xF7, 8), whole)

    def test_impossible_writes_and_values_raise(self):
        for reg, value in ((0xE0, 0x00), (0xF2, 0x08), (0xF5, 0x01), (0xF3, 0x00), (0x88, 0x12), (0xF7, 0x00)):
            with self.assertRaises(ValueError, msg=f'{reg:#x} <- {value:#x}'):
                self.write(reg, value)
        for values in ({'temperature_c': 86}, {'temperature_c': -41}, {'pressure_hpa': 299}, {'pressure_hpa': 1101},
                       {'humidity_pct': -1}, {'humidity_pct': 101}):
            with self.assertRaises(ValueError, msg=str(values)):
                self.slave.update(**values)

    def test_every_compensation_variant_prints_the_driven_values(self):
        """The raw values are solved against the C-division int32 form; the
        datasheet's shift and double forms differ from it by up to 0.02 °C
        (below 0 °C) and 0.013 %RH, inside the 0.05 a one-decimal print allows."""
        host = Bme280Host(self.slave)
        worst = {'temp': 0.0, 'hum': 0.0, 'press': 0.0}
        for temp in (-40, -12.5, -0.1, 0, 18, 25, 30, 31, 60.3, 85):
            for hum in (0, 20, 37, 50.5, 64, 80, 100):
                for press in (300, 1000, 1013.2, 1100):
                    self.slave.update(temperature_c=temp, pressure_hpa=press, humidity_pct=hum)
                    adc_p, adc_t, adc_h = self.measure_forced()
                    self.assertEqual(cdiv(self.slave._t_fine(adc_t) * 5 + 128, 256), round(temp * 100))
                    self.assertEqual(self.slave._compensate_h(adc_h, self.slave._t_fine(adc_t)) * 10 // 1024,
                                     round(hum * 10))
                    for t_fine, got in ((host.t_fine_shift(adc_t), host.temp_shift(adc_t)),
                                        (host.t_fine_float(adc_t), host.temp_float(adc_t))):
                        readings = {'temp': (got, temp), 'press': (host.press_int64(adc_p, int(t_fine)), press),
                                    'hum': (host.hum_shift(adc_h, int(t_fine)), hum),
                                    'hum_float': (host.hum_float(adc_h, t_fine), hum)}
                        for name, (seen, driven) in readings.items():
                            self.assertEqual(float(f'{seen:.1f}'), float(f'{driven:.1f}'), f'{name} at {temp} °C {hum} %RH {press} hPa')
                            key = name.split('_')[0]
                            worst[key] = max(worst[key], abs(seen - driven))
        self.assertLess(worst['temp'], 0.025)
        self.assertLess(worst['hum'], 0.015)
        self.assertLess(worst['press'], 0.02)

    def test_two_runs_are_identical(self):
        def run() -> list:
            self.setUp()
            seen = []
            self.write(0xF2, 0x03)
            self.write(0xF5, 0x20)
            self.write(0xF4, 0x57)
            for step in range(40):
                self.advance(13)
                if step == 20:
                    self.slave.update(temperature_c=31, pressure_hpa=990, humidity_pct=64)
                seen.append((self.status(), self.data()))
            return seen
        self.assertEqual(run(), run())


class TestBME280SlaveSpi(unittest.TestCase):
    """The 4-wire SPI transport on the same register file and clock."""

    def setUp(self):
        self.ns = 0
        self.slave = BME280Slave(now_ns=lambda: self.ns)
        self.advance(3)  # past status.im_update

    def advance(self, ms: float) -> None:
        self.ns += int(ms * 1_000_000)

    def frame(self, mosi: list) -> list:
        try:
            return [self.slave.spi_transfer(b) for b in mosi]
        finally:
            self.slave.spi_deselect()

    def read(self, reg: int, n: int) -> list:
        return self.frame([reg | 0x80] + [0xFF] * n)[1:]

    def test_control_byte_answers_zero_then_chip_id(self):
        self.assertEqual(self.frame([0xD0, 0x00]), [0x00, 0x60])

    def test_read_auto_increments_until_deselect(self):
        via_i2c = i2c_read_seq(BME280Slave(0x76, lambda: 0), 0x88, 26)
        self.assertEqual(self.read(0x88, 26), via_i2c)
        self.assertEqual(self.read(0xE1, 7), i2c_read_seq(BME280Slave(0x76, lambda: 0), 0xE1, 7))

    def test_deselect_opens_a_new_frame(self):
        self.slave.spi_transfer(0xD0)
        self.slave.spi_deselect()
        self.assertEqual(self.frame([0xF4 | 0x80, 0xFF]), [0x00, 0x00])

    def test_write_clears_bit7_and_takes_pairs(self):
        self.assertEqual(self.frame([0xF2 & 0x7F, 0x01, 0xF5 & 0x7F, 0x20, 0xF4 & 0x7F, 0x27]), [0] * 6)
        self.assertEqual(self.read(0xF2, 4), [0x01, 0x08, 0x27, 0x20])

    def test_forced_measurement_runs_on_the_clock(self):
        self.slave.update(temperature_c=31, pressure_hpa=990, humidity_pct=64)
        self.frame([0x72, 0x01, 0x74, 0x25])
        self.assertEqual(self.read(0xF3, 1), [0x08])
        self.assertEqual(self.read(0xF7, 8), [0x80, 0, 0, 0x80, 0, 0, 0x80, 0])
        self.advance(8)
        self.assertEqual(self.read(0xF3, 2), [0x00, 0x24])
        reference = BME280Slave(0x76, lambda: self.ns - 8_000_000)  # writes land where the SPI ones did
        reference.update(temperature_c=31, pressure_hpa=990, humidity_pct=64)
        i2c_write_seq(reference, 0xF2, [0x01])
        i2c_write_seq(reference, 0xF4, [0x25])
        reference.now_ns = lambda: self.ns
        self.assertEqual(self.read(0xF7, 8), i2c_read_seq(reference, 0xF7, 8))

    def test_data_holds_still_inside_one_read_frame(self):
        self.frame([0x72, 0x01, 0x75, 0x00, 0x74, 0x27])
        self.advance(8)
        before = self.read(0xF7, 8)
        self.slave.update(temperature_c=40, pressure_hpa=1013.25, humidity_pct=50)
        self.slave.spi_transfer(0xF7)
        head = [self.slave.spi_transfer(0xFF) for _ in range(3)]
        self.advance(20)
        tail = [self.slave.spi_transfer(0xFF) for _ in range(5)]
        self.slave.spi_deselect()
        self.assertEqual(head + tail, before)
        self.assertNotEqual(self.read(0xF7, 8), before)

    def test_three_wire_mode_and_read_only_writes_raise(self):
        with self.assertRaises(ValueError):
            self.frame([0x75, 0x01])
        with self.assertRaises(ValueError):
            self.frame([0x50, 0x00])
        with self.assertRaises(ValueError):
            self.frame([0x60, 0x00])

    def test_soft_reset(self):
        self.frame([0x72, 0x01, 0x74, 0x27])
        self.frame([0x60, 0xB6])
        self.assertEqual(self.read(0xF2, 3), [0x00, 0x01, 0x00])


def test_bme280_rejects_an_unknown_i2c_event():
    with pytest.raises(ValueError, match='bme280: unsupported I2C event 0x02'):
        BME280Slave().handle_event(0x02)
